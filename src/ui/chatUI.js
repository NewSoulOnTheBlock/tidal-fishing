// Global "Fishermans Hole" — a shared, global chat for everyone currently playing.
// Backed by the Render API (/api/chat). Real-time-ish via lightweight polling.
// Banned wallets are blocked server-side; posting requires a chosen angler name.

import { S, events } from "../state/gameState.js";
import { currentPublicKey } from "../web3/wallet.js";
import { shortAddress } from "../web3/solana.js";
import { apiFetch } from "../utils/api.js";

const POLL_MS = 4000;
const MAX_RENDER = 80;

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
    this.startPolling();

    // Pause polling while the tab is hidden / the page is in the back-forward
    // cache to avoid needless network churn; resume when it's shown again.
    this._onVisibility = () => {
      if (document.hidden) this.stopPolling();
      else this.startPolling();
    };
    document.addEventListener("visibilitychange", this._onVisibility);
    this._onPageHide = () => this.stopPolling();
    this._onPageShow = () => { if (!document.hidden) this.startPolling(); };
    window.addEventListener("pagehide", this._onPageHide);
    window.addEventListener("pageshow", this._onPageShow);
  }

  startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.poll(), POLL_MS);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
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
    } catch {
      /* transient network error — next tick retries */
    }
  }

  appendMessage(m) {
    if (this.seen.has(m.id)) return;
    this.seen.add(m.id);
    this.lastId = Math.max(this.lastId, m.id);

    const empty = this.listEl.querySelector(".trollbox-empty");
    if (empty) empty.remove();

    const mine = this.currentWallet() === m.wallet_address;
    const who = m.username ? this.esc(m.username) : shortAddress(m.wallet_address);
    const row = document.createElement("div");
    row.className = "trollbox-msg" + (mine ? " mine" : "");
    row.innerHTML =
      `<span class="trollbox-name">${who}</span>` +
      `<span class="trollbox-text">${this.esc(m.message)}</span>`;
    this.listEl.appendChild(row);

    while (this.listEl.children.length > MAX_RENDER) {
      this.listEl.removeChild(this.listEl.firstChild);
    }
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
      <input class="trollbox-input" type="text" maxlength="280" placeholder="Message the seas…" autocomplete="off" />
      <button class="trollbox-send" title="Send">➤</button>
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
  }

  async send(input) {
    const text = input.value.trim();
    if (!text || this.sending) return;
    const pk = this.currentWallet();
    const name = (S.profile?.username || "").trim();
    if (!pk || !name) {
      this.maybeRefreshFooter();
      return;
    }
    this.sending = true;
    input.disabled = true;
    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        auth: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: pk, username: name, message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        input.value = "";
        if (data.message) {
          this.appendMessage(data.message);
          this.scrollToBottom();
        }
      } else if (res.status === 403) {
        events.emit("toast", { msg: "🚫 You're banned from the Fishermans Hole", kind: "warn" });
      } else if (data.code === "RATE_LIMIT") {
        events.emit("toast", { msg: "💬 Easy there — slow down a sec", kind: "info" });
      } else if (data.code === "NAME_REQUIRED") {
        events.emit("onboarding:needed", { walletAddress: pk });
      } else {
        events.emit("toast", { msg: data.error || "Message failed to send", kind: "warn" });
      }
    } catch {
      events.emit("toast", { msg: "Chat is offline right now", kind: "warn" });
    } finally {
      this.sending = false;
      input.disabled = false;
      input.focus();
    }
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
