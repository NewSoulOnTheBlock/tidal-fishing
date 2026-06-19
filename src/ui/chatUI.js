// Global "Fishermans Hole" — a shared, global chat for everyone currently playing.
// Backed by the Render API (/api/chat). Real-time-ish via lightweight polling.
// Banned wallets are blocked server-side; posting requires a chosen angler name.

import { S, events } from "../state/gameState.js";
import { currentPublicKey } from "../web3/wallet.js";
import { shortAddress } from "../web3/solana.js";
import { apiFetch } from "../utils/api.js";
import { cachedGetJson } from "../utils/apiCache.js";
import { getOnline, getHotSpotLabel } from "../web3/world.js";

const POLL_MS = 4000;
const POLL_MAX = 30000; // idle back-off ceiling
const MAX_RENDER = 80;
const MEDALS = ["🥇", "🥈", "🥉"];
const EMOTES = ["🎣", "🐟", "👏", "🔥", "😂"];

export class ChatUI {
  constructor() {
    this.root = null;
    this.listEl = null;
    this.footerEl = null;
    this.lastId = 0;
    this.open = true;
    this.sending = false;
    this.seen = new Set();
    this.pollTimer = null;
    this._footerSig = null;
    this.medals = new Map();   // wallet_address -> medal emoji (top 3 earners)
    this._pollCount = 0;
    this._pollDelay = POLL_MS;  // adaptive: grows when chat is idle
    this._emptyStreak = 0;
    this._pollGen = 0;          // invalidates in-flight poll loops on stop
  }

  mount() {
    if (this.root) return;
    this.root = document.createElement("div");
    this.root.id = "trollbox";
    this.root.className = "trollbox";
    this.root.innerHTML = `
      <div class="trollbox-header">
        <span class="trollbox-title">🎣 Fishermans Hole <span class="trollbox-sub">global chat</span></span>
        <button class="trollbox-toggle" title="Minimize">—</button>
      </div>
      <div class="trollbox-messages" id="trollbox-messages">
        <div class="trollbox-empty">Loading chat…</div>
      </div>
      <div class="trollbox-footer" id="trollbox-footer"></div>
    `;
    document.body.appendChild(this.root);
    this.listEl = this.root.querySelector("#trollbox-messages");
    this.footerEl = this.root.querySelector("#trollbox-footer");

    this.root.querySelector(".trollbox-toggle").addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggle();
    });
    this.root.querySelector(".trollbox-header").addEventListener("click", () => {
      if (!this.open) this.toggle();
    });

    this.maybeRefreshFooter();
    this.fetchInitial();
    this.loadMedals();
    this.startPolling();

    // Pause polling while the tab is hidden / the page is in the back-forward
    // cache to avoid needless network churn; resume when it's shown again.
    this._onVisibility = () => {
      if (document.hidden) this.stopPolling();
      else { this._pollDelay = POLL_MS; this._emptyStreak = 0; this.startPolling(); }
    };
    document.addEventListener("visibilitychange", this._onVisibility);
    this._onPageHide = () => this.stopPolling();
    this._onPageShow = () => { if (!document.hidden) this.startPolling(); };
    window.addEventListener("pagehide", this._onPageHide);
    window.addEventListener("pageshow", this._onPageShow);
  }

  startPolling() {
    if (this.pollTimer) return;
    const gen = ++this._pollGen;
    const loop = async () => {
      if (gen !== this._pollGen) return;
      await this.poll();
      if (gen !== this._pollGen) return; // stopped while polling
      this.pollTimer = setTimeout(loop, this._pollDelay);
    };
    this.pollTimer = setTimeout(loop, this._pollDelay);
  }

  stopPolling() {
    this._pollGen++; // invalidate any in-flight loop
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // Adaptive cadence: poll fast (4s) when chat is active, back off toward 30s
  // after several empty polls so an idle tab stops hammering the API.
  _adjustPoll(gotNew) {
    if (gotNew) {
      this._emptyStreak = 0;
      this._pollDelay = POLL_MS;
    } else if (++this._emptyStreak >= 3) {
      this._pollDelay = Math.min(this._pollDelay * 2, POLL_MAX);
    }
  }

  unmount() {
    this.stopPolling();
    if (this._onVisibility) document.removeEventListener("visibilitychange", this._onVisibility);
    if (this._onPageHide) window.removeEventListener("pagehide", this._onPageHide);
    if (this._onPageShow) window.removeEventListener("pageshow", this._onPageShow);
    this.root?.remove();
    this.root = null;
  }

  toggle() {
    this.open = !this.open;
    this.root.classList.toggle("collapsed", !this.open);
    this.root.querySelector(".trollbox-toggle").textContent = this.open ? "—" : "▢";
    if (this.open) this.scrollToBottom();
  }

  async fetchInitial() {
    try {
      const res = await apiFetch("/api/chat?limit=60");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const msgs = data.messages || [];
      this.listEl.innerHTML = "";
      if (msgs.length === 0) {
        this.listEl.innerHTML = `<div class="trollbox-empty">No messages yet. Say hi 👋</div>`;
      } else {
        msgs.forEach((m) => this.appendMessage(m));
        this.scrollToBottom();
      }
    } catch {
      this.listEl.innerHTML = `<div class="trollbox-empty">Chat unavailable right now</div>`;
    }
  }

  async poll() {
    this.maybeRefreshFooter();
    // Refresh the top-3 medal map roughly once a minute (every ~15 polls).
    if ((++this._pollCount % 15) === 0) this.loadMedals();
    if (!this.lastId) return this.fetchInitial();
    try {
      const res = await apiFetch(`/api/chat?since=${this.lastId}&limit=100`);
      if (!res.ok) return;
      const data = await res.json();
      const msgs = data.messages || [];
      if (msgs.length) {
        const atBottom = this.isAtBottom();
        msgs.forEach((m) => this.appendMessage(m));
        if (atBottom) this.scrollToBottom();
      }
      this._adjustPoll(msgs.length > 0);
    } catch {
      /* transient network error — next tick retries */
    }
  }

  // Fetch the current top-3 earners so their names get a 🥇🥈🥉 in chat.
  async loadMedals() {
    try {
      const data = await cachedGetJson("/api/leaderboard?limit=3", 30000);
      const rows = data.leaderboard || [];
      const next = new Map();
      rows.slice(0, 3).forEach((r, i) => {
        if (r.wallet_address) next.set(r.wallet_address, MEDALS[i]);
      });
      this.medals = next;
    } catch {
      /* leaderboard unavailable — flair is best-effort */
    }
  }

  appendMessage(m) {
    if (this.seen.has(m.id)) return;
    if (this.seen.size > 2000) this.seen.clear(); // bound growth; lastId still guards order
    this.seen.add(m.id);
    this.lastId = Math.max(this.lastId, m.id);

    const empty = this.listEl.querySelector(".trollbox-empty");
    if (empty) empty.remove();

    const kind = m.kind || "user";
    const isSystem = kind !== "user" || m.wallet_address === "SYSTEM";

    const row = document.createElement("div");
    if (isSystem) {
      // System "live feed" line (welcome / rare / catch broadcast).
      row.className = `trollbox-msg trollbox-sys sys-${this.esc(kind)}`;
      row.innerHTML = `<span class="trollbox-text">${this.esc(m.message)}</span>`;
    } else {
      const mine = this.currentWallet() === m.wallet_address;
      const who = m.username ? this.esc(m.username) : shortAddress(m.wallet_address);
      const medal = this.medals.get(m.wallet_address);
      const lvl = Number(m.level) || 0;
      const flair =
        (medal ? `<span class="trollbox-medal">${medal}</span>` : "") +
        (lvl > 0 ? `<span class="trollbox-lvl">Lv${lvl}</span>` : "");
      row.className = "trollbox-msg" + (mine ? " mine" : "");
      row.innerHTML =
        `${flair}<span class="trollbox-name">${who}</span>` +
        `<span class="trollbox-text">${this.esc(m.message)}</span>`;
    }
    this.listEl.appendChild(row);

    while (this.listEl.children.length > MAX_RENDER) {
      this.listEl.removeChild(this.listEl.firstChild);
    }
  }

  // Render an ephemeral, local-only line (slash-command replies). Not persisted,
  // not counted in `seen`, and pruned with the rest.
  appendLocal(text) {
    const empty = this.listEl.querySelector(".trollbox-empty");
    if (empty) empty.remove();
    const row = document.createElement("div");
    row.className = "trollbox-msg trollbox-sys sys-local";
    row.innerHTML = `<span class="trollbox-text">${this.esc(text)}</span>`;
    this.listEl.appendChild(row);
    while (this.listEl.children.length > MAX_RENDER) {
      this.listEl.removeChild(this.listEl.firstChild);
    }
    this.scrollToBottom();
  }

  // Footer reflects connection/name state; re-rendered only when that changes.
  maybeRefreshFooter() {
    const pk = this.currentWallet();
    const name = (S.profile?.username || "").trim();
    const sig = `${pk || ""}|${name ? "named" : "anon"}`;
    if (sig === this._footerSig) return;
    this._footerSig = sig;
    this.renderFooter(pk, name);
  }

  renderFooter(pk, name) {
    if (!pk) {
      this.footerEl.innerHTML = `<div class="trollbox-locked">Connect your wallet to chat</div>`;
      return;
    }
    if (!name) {
      this.footerEl.innerHTML = `<button class="trollbox-setname">Choose a name to chat →</button>`;
      this.footerEl.querySelector(".trollbox-setname").addEventListener("click", () => {
        events.emit("onboarding:needed", { walletAddress: pk });
      });
      return;
    }
    this.footerEl.innerHTML = `
      <div class="trollbox-emotes">
        ${EMOTES.map((e) => `<button class="trollbox-emote" type="button" data-emote="${e}">${e}</button>`).join("")}
      </div>
      <div class="trollbox-compose">
        <input class="trollbox-input" type="text" maxlength="280" placeholder="Message the seas…  (/help)" autocomplete="off" />
        <button class="trollbox-send" title="Send">➤</button>
      </div>
    `;
    const input = this.footerEl.querySelector(".trollbox-input");
    const send = this.footerEl.querySelector(".trollbox-send");
    const doSend = () => this.send(input);
    send.addEventListener("click", doSend);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doSend();
      }
    });
    this.footerEl.querySelectorAll(".trollbox-emote").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (this.sending) return;
        this.sendText(btn.dataset.emote);
      });
    });
  }

  async send(input) {
    const text = input.value.trim();
    if (!text || this.sending) return;
    // Slash-commands are handled locally and never posted to the global chat.
    if (text.startsWith("/")) {
      input.value = "";
      this.handleCommand(text);
      return;
    }
    const ok = await this.sendText(text);
    if (ok) input.value = "";
  }

  // Posts a message (or emote) to the global chat. Returns true on success so
  // the caller can clear its input. Shared by the text composer + emote buttons.
  async sendText(text) {
    const msg = String(text || "").trim();
    if (!msg || this.sending) return false;
    const pk = this.currentWallet();
    const name = (S.profile?.username || "").trim();
    if (!pk || !name) {
      this.maybeRefreshFooter();
      return false;
    }
    this.sending = true;
    const input = this.footerEl.querySelector(".trollbox-input");
    if (input) input.disabled = true;
    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        auth: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: pk, username: name, message: msg }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.message) {
          this.appendMessage(data.message);
          this.scrollToBottom();
        }
        return true;
      }
      if (res.status === 403) {
        events.emit("toast", { msg: "🚫 You're banned from the Fishermans Hole", kind: "warn" });
      } else if (data.code === "RATE_LIMIT") {
        events.emit("toast", { msg: "💬 Easy there — slow down a sec", kind: "info" });
      } else if (data.code === "NAME_REQUIRED") {
        events.emit("onboarding:needed", { walletAddress: pk });
      } else {
        events.emit("toast", { msg: data.error || "Message failed to send", kind: "warn" });
      }
      return false;
    } catch {
      events.emit("toast", { msg: "Chat is offline right now", kind: "warn" });
      return false;
    } finally {
      this.sending = false;
      if (input) {
        input.disabled = false;
        input.focus();
      }
    }
  }

  // Local self-lookup commands: /online, /rank, /best, /help. Replies render as
  // ephemeral local lines — nothing is broadcast to other players.
  async handleCommand(raw) {
    const cmd = raw.slice(1).trim().toLowerCase().split(/\s+/)[0];
    if (cmd === "help" || cmd === "commands") {
      this.appendLocal("Commands: /online · /rank · /best · /help");
      return;
    }
    if (cmd === "online") {
      const n = getOnline();
      const hot = getHotSpotLabel();
      this.appendLocal(`🌊 ${n} angler${n === 1 ? "" : "s"} fishing now${hot ? ` · 🔥 Hot spot: ${hot} (+10%)` : ""}`);
      return;
    }
    if (cmd === "rank" || cmd === "best") {
      const pk = this.currentWallet();
      if (!pk) { this.appendLocal("Connect your wallet first."); return; }
      try {
        const res = await apiFetch(`/api/player/rank/${pk}`);
        if (!res.ok) { this.appendLocal("No stats yet — go land a fish! 🎣"); return; }
        const d = await res.json();
        if (cmd === "rank") {
          const earned = Math.round(Number(d.totalEarned) || 0).toLocaleString("en-US");
          this.appendLocal(`🏅 You're #${d.rank} · ${earned} $TIDE earned · ${d.totalCatches} catches${d.streak ? ` · 🔥${d.streak}d streak` : ""}`);
        } else {
          this.appendLocal(d.best
            ? `🐟 Your biggest: ${d.best.sizeCm}cm ${d.best.species}`
            : "No catches recorded yet — cast a line! 🎣");
        }
      } catch {
        this.appendLocal("Stats unavailable right now.");
      }
      return;
    }
    this.appendLocal(`Unknown command: /${this.esc(cmd)}. Try /help`);
  }

  currentWallet() {
    try {
      const pk = currentPublicKey();
      return pk ? pk.toString() : null;
    } catch {
      return null;
    }
  }

  isAtBottom() {
    const el = this.listEl;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }

  scrollToBottom() {
    this.listEl.scrollTop = this.listEl.scrollHeight;
  }

  esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
