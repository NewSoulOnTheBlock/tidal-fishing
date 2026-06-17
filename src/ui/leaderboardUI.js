// Leaderboard UI - Global rankings and recent catches
// Now powered by PostgreSQL database!

import { S } from "../state/gameState.js";
import { formatMoney } from "../utils/utils.js";
import { shortAddress } from "../web3/solana.js";
import { FISH_BY_ID } from "../data/fishData.js";
import { apiFetch } from "../utils/api.js";

export class LeaderboardUI {
  constructor() {
    this.panel = null;
    this.currentTab = "earnings";
  }

  async show() {
    // Guard against stacking: remove any existing leaderboard overlay(s) first.
    // Opening the leaderboard doesn't change the game phase, so a second open
    // would otherwise leave an un-closable panel layered on top.
    document.querySelectorAll('#leaderboard-panel').forEach(el => el.remove());

    this.panel = document.createElement("div");
    this.panel.id = "leaderboard-panel";
    this.panel.className = "modal-overlay";
    
    this.panel.innerHTML = `
      <div class="modal-content leaderboard-modal">
        <div class="modal-header">
          <h2>🏆 Leaderboard</h2>
          <button class="btn-close">×</button>
        </div>
        
        <div class="leaderboard-tabs">
          <button class="tab-btn active" data-tab="earnings">Top Earners</button>
          <button class="tab-btn" data-tab="recent">Recent Catches</button>
          <button class="tab-btn" data-tab="species">By Species</button>
        </div>
        
        <div id="leaderboard-content" class="leaderboard-content">
          <div class="loading">Loading...</div>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.panel);
    this.bindEvents();
    this.loadTab("earnings");
  }

  bindEvents() {
    const closeBtn = this.panel.querySelector('.btn-close');
    closeBtn.addEventListener('click', () => this.hide());

    // Close on Escape. Capture phase + stopPropagation so the game's global
    // keydown handler doesn't also fire (which would pop the pause menu).
    this._escHandler = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.hide();
      }
    };
    document.addEventListener('keydown', this._escHandler, true);

    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) { this.hide(); return; }

      // Clicking a podium medal opens a pre-filled X/Twitter share.
      const medal = e.target.closest('.trophy[data-share]');
      if (medal) {
        e.stopPropagation();
        window.open(medal.dataset.share, '_blank', 'noopener,noreferrer');
        return;
      }

      const tabBtn = e.target.closest('.tab-btn');
      if (tabBtn) {
        this.panel.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        tabBtn.classList.add('active');
        this.loadTab(tabBtn.dataset.tab);
        return;
      }

      const speciesBtn = e.target.closest('.species-btn');
      if (speciesBtn) {
        this.loadSpeciesLeaderboard(speciesBtn.dataset.species);
      }
    });
  }

  async loadTab(tab) {
    this.currentTab = tab;
    const content = this.panel.querySelector('#leaderboard-content');
    content.innerHTML = '<div class="loading">Loading...</div>';

    try {
      if (tab === "earnings") {
        const response = await apiFetch("/api/leaderboard?limit=100");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        // Server returns { leaderboard: [...] } already ordered by earnings.
        // Rank isn't in the payload, so derive it from position.
        const entries = (data.leaderboard || []).map((entry, i) => ({
          ...entry,
          rank: i + 1,
        }));
        content.innerHTML = this.renderEarnings(entries);
      } else if (tab === "recent") {
        const response = await apiFetch("/api/leaderboard?type=recent&limit=50");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        content.innerHTML = this.renderRecent(data.catches);
      } else if (tab === "species") {
        content.innerHTML = this.renderSpeciesSelector();
      }
    } catch (error) {
      console.error('[leaderboard] Failed to load:', error);
      content.innerHTML = `
        <div class="error">
          <p>Failed to load leaderboard</p>
          <p class="error-detail">${error.message}</p>
          <button class="btn btn-retry" onclick="window.location.reload()">Retry</button>
        </div>
      `;
    }
  }

  renderEarnings(leaderboard) {
    if (!leaderboard || leaderboard.length === 0) {
      return '<div class="empty">No entries yet. Be the first to fish and claim your spot!</div>';
    }

    return `
      <div class="leaderboard-list">
        ${leaderboard.map((entry, i) => `
          <div class="leaderboard-entry ${i < 3 ? `rank-${entry.rank}` : ''}">
            <div class="entry-rank">${entry.rank}</div>
            <div class="entry-info">
              <div class="entry-wallet">${shortAddress(entry.wallet_address)}</div>
              <div class="entry-stats">
                <span class="entry-value">${formatMoney(entry.total_earned)} earned</span>
                <span class="entry-meta"> • ${entry.total_catches} catches</span>
              </div>
            </div>
            ${this.medal(entry)}
          </div>
        `).join('')}
      </div>
    `;
  }

  // X/Twitter share link builder.
  tweetUrl(text) {
    const params = new URLSearchParams({ text, url: 'https://tidalfishing.fun' });
    return `https://twitter.com/intent/tweet?${params.toString()}`;
  }

  // Clickable podium medal (top 3) for the earnings leaderboard.
  medal(entry) {
    if (!entry || entry.rank > 3) return '';
    const icon = ['🥇', '🥈', '🥉'][entry.rank - 1];
    const place = ['1st', '2nd', '3rd'][entry.rank - 1];
    const who = entry.username ? entry.username : shortAddress(entry.wallet_address);
    const text = `${icon} ${who} is ${place} on the Tidal Fishing leaderboard with ${formatMoney(Number(entry.total_earned))} earned! 🎣 Can you out-fish them?`;
    return `<div class="trophy" data-share="${this.esc(this.tweetUrl(text))}" title="Share on X" role="button">${icon}</div>`;
  }

  // Clickable podium medal (top 3) for a species' biggest catches.
  speciesMedal(c, i, speciesName) {
    if (i > 2) return '';
    const icon = ['🥇', '🥈', '🥉'][i];
    const place = ['1st', '2nd', '3rd'][i];
    const who = c.username ? c.username : shortAddress(c.wallet_address);
    const text = `${icon} ${who} holds the ${place}-biggest ${speciesName} on Tidal Fishing — ${Number(c.size_cm).toFixed(1)}cm! 🎣 Think you can beat it?`;
    return `<div class="trophy" data-share="${this.esc(this.tweetUrl(text))}" title="Share on X" role="button">${icon}</div>`;
  }

  renderRecent(catches) {
    if (!catches || catches.length === 0) {
      return '<div class="empty">No catches recorded yet. Cast a line to be the first!</div>';
    }

    return `
      <div class="recent-feed">
        ${catches.map(c => {
          const species = FISH_BY_ID[c.species_id];
          const who = c.username ? this.esc(c.username) : shortAddress(c.wallet_address);
          const when = this.timeAgo(new Date(c.caught_at).getTime());
          return `
            <div class="feed-item">
              <div class="feed-icon">🐟</div>
              <div class="feed-content">
                <div class="feed-text">
                  <span class="feed-wallet">${who}</span> caught a
                  <span class="feed-species">${this.esc(species?.name || c.species_id)}</span>
                </div>
                <div class="feed-meta">
                  ${Number(c.size_cm).toFixed(1)}cm • ${formatMoney(Number(c.value))} • ${when}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderSpeciesSelector() {
    const species = Object.values(FISH_BY_ID).filter(s => s.rarity !== 'common');
    return `
      <div class="species-grid">
        ${species.map(s => `
          <button class="species-btn" data-species="${s.id}">
            <div class="species-icon">${s.look?.image ? `<img src="${s.look.image}" width="60" />` : '🐟'}</div>
            <div class="species-name">${s.name}</div>
          </button>
        `).join('')}
      </div>
    `;
  }

  async loadSpeciesLeaderboard(speciesId) {
    const content = this.panel.querySelector('#leaderboard-content');
    content.innerHTML = '<div class="loading">Loading...</div>';

    try {
      const response = await apiFetch(`/api/leaderboard?type=species&species=${speciesId}&limit=20`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const species = FISH_BY_ID[speciesId];

      content.innerHTML = `
        <div class="species-leaderboard">
          <button class="btn-back">← Back to Species</button>
          <h3>${this.esc(species?.name || speciesId)} - Biggest Catches</h3>
          ${this.renderSpeciesCatches(data.catches, species?.name || speciesId)}
        </div>
      `;

      content.querySelector('.btn-back').addEventListener('click', () => {
        this.loadTab('species');
      });
    } catch (error) {
      content.innerHTML = `<div class="error">Failed to load: ${error.message}</div>`;
    }
  }

  renderSpeciesCatches(catches, speciesName) {
    if (!catches || catches.length === 0) {
      return '<div class="empty">No catches recorded for this species yet</div>';
    }

    return `
      <div class="leaderboard-list">
        ${catches.map((c, i) => {
          const who = c.username ? this.esc(c.username) : shortAddress(c.wallet_address);
          return `
            <div class="leaderboard-entry">
              <div class="entry-rank">${i + 1}</div>
              <div class="entry-info">
                <div class="entry-wallet">${who}</div>
                <div class="entry-value">${Number(c.size_cm).toFixed(1)}cm • ${Number(c.weight_kg).toFixed(2)}kg • ${formatMoney(Number(c.value))}</div>
              </div>
              ${this.speciesMedal(c, i, speciesName)}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  hide() {
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler, true);
      this._escHandler = null;
    }
    document.querySelectorAll('#leaderboard-panel').forEach(el => el.remove());
    this.panel = null;
  }
}

// Helper function to submit catch to leaderboard
export async function submitToLeaderboard(catchData, wallet) {
  if (!wallet) return;

  try {
    await apiFetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet,
        species: catchData.species,
        sizeCm: catchData.sizeCm,
        weightKg: catchData.weightKg,
        value: catchData.value,
        timestamp: Date.now(),
      }),
    });
  } catch (error) {
    console.error("Failed to submit to leaderboard:", error);
  }
}
