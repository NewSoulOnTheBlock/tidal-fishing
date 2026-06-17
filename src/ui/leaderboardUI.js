// Leaderboard UI - Global rankings and recent catches
// Now powered by PostgreSQL database!

import { S } from "../state/gameState.js";
import { formatMoney } from "../utils/utils.js";
import { shortAddress } from "../web3/solana.js";
import { FISH_BY_ID } from "../data/fishData.js";

// Point to API server on Render (or localhost for dev)
const API_BASE = window.location.hostname === "localhost" 
  ? "http://localhost:3000" 
  : "https://tidal-fishing.onrender.com";

export class LeaderboardUI {
  constructor() {
    this.panel = null;
    this.currentTab = "earnings";
  }

  async show() {
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
    
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();

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
        const response = await fetch(`${API_BASE}/api/leaderboard?limit=100`);
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
        const response = await fetch(`${API_BASE}/api/leaderboard?type=recent&limit=50`);
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
            ${entry.rank === 1 ? '<div class="trophy">🥇</div>' : entry.rank === 2 ? '<div class="trophy">🥈</div>' : entry.rank === 3 ? '<div class="trophy">🥉</div>' : ''}
          </div>
        `).join('')}
      </div>
    `;
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
      const response = await fetch(`${API_BASE}/api/leaderboard?type=species&species=${speciesId}&limit=20`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const species = FISH_BY_ID[speciesId];

      content.innerHTML = `
        <div class="species-leaderboard">
          <button class="btn-back">← Back to Species</button>
          <h3>${this.esc(species?.name || speciesId)} - Biggest Catches</h3>
          ${this.renderSpeciesCatches(data.catches)}
        </div>
      `;

      content.querySelector('.btn-back').addEventListener('click', () => {
        this.loadTab('species');
      });
    } catch (error) {
      content.innerHTML = `<div class="error">Failed to load: ${error.message}</div>`;
    }
  }

  renderSpeciesCatches(catches) {
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
              ${i < 3 ? `<div class="trophy">${['🥇', '🥈', '🥉'][i]}</div>` : ''}
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
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }
}

// Helper function to submit catch to leaderboard
export async function submitToLeaderboard(catchData, wallet) {
  if (!wallet) return;

  try {
    await fetch(`${API_BASE}/api/leaderboard`, {
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
