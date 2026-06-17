// Leaderboard UI - Global rankings and recent catches

import { S } from "../state/gameState.js";
import { formatMoney } from "../utils/utils.js";
import { shortAddress } from "../web3/solana.js";
import { FISH_BY_ID } from "../data/fishData.js";

const API_BASE = window.location.hostname === "localhost" ? "http://localhost:5173" : "";

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
      
      if (e.target.classList.contains('tab-btn')) {
        this.panel.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.loadTab(e.target.dataset.tab);
      }
      
      if (e.target.classList.contains('species-btn')) {
        this.loadSpeciesLeaderboard(e.target.dataset.species);
      }
    });
  }

  async loadTab(tab) {
    this.currentTab = tab;
    const content = this.panel.querySelector('#leaderboard-content');
    content.innerHTML = '<div class="loading">Loading...</div>';

    try {
      if (tab === "earnings") {
        const response = await fetch(`${API_BASE}/api/leaderboard?type=earnings&limit=20`);
        const data = await response.json();
        content.innerHTML = this.renderEarnings(data.leaderboard);
      } else if (tab === "recent") {
        const response = await fetch(`${API_BASE}/api/leaderboard?type=recent&limit=50`);
        const data = await response.json();
        content.innerHTML = this.renderRecent(data.catches);
      } else if (tab === "species") {
        content.innerHTML = this.renderSpeciesSelector();
      }
    } catch (error) {
      content.innerHTML = `<div class="error">Failed to load leaderboard: ${error.message}</div>`;
    }
  }

  renderEarnings(leaderboard) {
    if (!leaderboard || leaderboard.length === 0) {
      return '<div class="empty">No entries yet. Be the first!</div>';
    }

    return `
      <div class="leaderboard-list">
        ${leaderboard.map((entry, i) => `
          <div class="leaderboard-entry ${i < 3 ? `rank-${i + 1}` : ''}">
            <div class="entry-rank">${i + 1}</div>
            <div class="entry-info">
              <div class="entry-wallet">${shortAddress(entry.wallet)}</div>
              <div class="entry-value">${formatMoney(entry.totalEarnings)} earned</div>
            </div>
            ${i === 0 ? '<div class="trophy">🥇</div>' : i === 1 ? '<div class="trophy">🥈</div>' : i === 2 ? '<div class="trophy">🥉</div>' : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  renderRecent(catches) {
    if (!catches || catches.length === 0) {
      return '<div class="empty">No recent catches</div>';
    }

    return `
      <div class="recent-feed">
        ${catches.map(c => {
          const species = FISH_BY_ID[c.species];
          return `
            <div class="feed-item">
              <div class="feed-icon">${species?.look?.image ? `<img src="${species.look.image}" width="40" />` : '🐟'}</div>
              <div class="feed-content">
                <div class="feed-text">
                  <span class="feed-wallet">${shortAddress(c.wallet)}</span> caught a 
                  <span class="feed-species">${species?.name || c.species}</span>
                </div>
                <div class="feed-meta">
                  ${c.sizeCm.toFixed(1)}cm • ${formatMoney(c.value)} • ${this.timeAgo(c.timestamp)}
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
      const data = await response.json();
      const species = FISH_BY_ID[speciesId];
      
      content.innerHTML = `
        <div class="species-leaderboard">
          <button class="btn-back">← Back to Species</button>
          <h3>${species.name} - Biggest Catches</h3>
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
      return '<div class="empty">No catches recorded yet</div>';
    }

    return `
      <div class="leaderboard-list">
        ${catches.map((c, i) => `
          <div class="leaderboard-entry">
            <div class="entry-rank">${i + 1}</div>
            <div class="entry-info">
              <div class="entry-wallet">${shortAddress(c.wallet)}</div>
              <div class="entry-value">${c.sizeCm.toFixed(1)}cm • ${c.weightKg.toFixed(2)}kg • ${formatMoney(c.value)}</div>
            </div>
            ${i < 3 ? `<div class="trophy">${['🥇', '🥈', '🥉'][i]}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
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
