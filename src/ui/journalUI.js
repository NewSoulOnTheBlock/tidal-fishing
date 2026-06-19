// Fish Journal UI - Pokédex-style collection viewer

import { S } from "../state/gameState.js";
import { getJournalStats, getCompletionRewards, claimReward } from "../progression/journal.js";
import { FISH_SPECIES, RARITIES } from "../data/fishData.js";
import { formatMoney } from "../utils/utils.js";
import { addMoney } from "../economy/economy.js";
import { audio } from "../audio/audioManager.js";

export class JournalUI {
  constructor() {
    this.panel = null;
    this._filter = "all";
    this._search = "";
  }

  show() {
    if (!S.progressionJournal) return;
    if (this.panel) this.hide(); // never stack a second panel on repeat opens

    this.panel = document.createElement("div");
    this.panel.id = "journal-panel";
    this.panel.className = "modal-overlay";
    
    const stats = getJournalStats(S.progressionJournal);
    const rewards = getCompletionRewards(S.progressionJournal);
    
    this.panel.innerHTML = `
      <div class="modal-content journal-modal">
        <div class="modal-header">
          <h2>📖 Fish Journal</h2>
          <button class="btn-close">×</button>
        </div>
        <div class="journal-stats">
          <div class="stat-box">
            <div class="stat-value">${stats.uniqueSpecies}/${stats.totalSpecies}</div>
            <div class="stat-label">Species Caught</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${stats.totalCaught}</div>
            <div class="stat-label">Total Catches</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${stats.completionPercent}%</div>
            <div class="stat-label">Completion</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${formatMoney(stats.totalValue)}</div>
            <div class="stat-label">Total Value</div>
          </div>
        </div>
        
        ${rewards.length > 0 ? `
          <div class="journal-rewards">
            <h3>🎁 Rewards Available!</h3>
            ${rewards.map(r => `
              <div class="reward-claim">
                <span>${r.label}</span>
                <button class="btn-claim" data-reward="${r.id}">
                  Claim ${formatMoney(r.amount)}
                </button>
              </div>
            `).join('')}
          </div>
        ` : ''}
        
        <div class="journal-search">
          <input type="search" class="journal-search-input" placeholder="🔍 Search species…" aria-label="Search species" />
        </div>

        <div class="journal-filters">
          <button class="filter-btn active" data-filter="all">All</button>
          <button class="filter-btn" data-filter="caught">Caught</button>
          <button class="filter-btn" data-filter="uncaught">Missing</button>
          ${Object.keys(RARITIES).map(r => `
            <button class="filter-btn" data-filter="${r}">${RARITIES[r].label}</button>
          `).join('')}
        </div>
        
        <div class="journal-grid">
          ${stats.species.map(sp => this.renderSpeciesCard(sp)).join('')}
        </div>
      </div>
    `;
    
    document.body.appendChild(this.panel);
    this.bindEvents();
  }

  renderSpeciesCard(sp) {
    const hasCaught = sp.hasCaught;
    const rarity = RARITIES[sp.rarity];
    
    return `
      <div class="journal-card ${hasCaught ? 'caught' : 'uncaught'}" 
           data-rarity="${sp.rarity}"
           data-name="${hasCaught ? sp.name.toLowerCase().replace(/"/g, '') : ''}"
           style="--rarity-color: ${rarity.color}">
        ${hasCaught ? `
          <div class="card-image" style="background: linear-gradient(135deg, ${rarity.color}22, ${rarity.color}44)">
            ${sp.look?.image ? 
              `<img src="${sp.look.image}" alt="${sp.name}" />` : 
              `<div class="fish-silhouette">🐟</div>`
            }
          </div>
          <div class="card-info">
            <h4>${sp.name}</h4>
            <div class="rarity-badge" style="background: ${rarity.color}">${rarity.label}</div>
            <div class="stats-row">
              <span>Caught: ${sp.caught}</span>
              <span>Best: ${sp.biggestSize.toFixed(1)}cm</span>
            </div>
            <div class="stats-row">
              <span>${formatMoney(sp.totalValue)} earned</span>
            </div>
          </div>
        ` : `
          <div class="card-unknown">
            <div class="silhouette">❓</div>
            <div class="unknown-text">???</div>
            <div class="rarity-badge" style="background: ${rarity.color}">${rarity.label}</div>
          </div>
        `}
      </div>
    `;
  }

  bindEvents() {
    this._filter = "all";
    this._search = "";

    const closeBtn = this.panel.querySelector('.btn-close');
    closeBtn.addEventListener('click', () => this.hide());

    const searchInput = this.panel.querySelector('.journal-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this._search = searchInput.value.trim().toLowerCase();
        this.applyFilters();
      });
    }

    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
      
      if (e.target.classList.contains('btn-claim')) {
        const rewardId = e.target.dataset.reward;
        const reward = getCompletionRewards(S.progressionJournal).find(r => r.id === rewardId);
        if (reward) {
          audio.play("reward");
          claimReward(S.progressionJournal, rewardId);
          addMoney(reward.amount);
          this.hide();
          this.show(); // refresh
        }
      }
      
      if (e.target.classList.contains('filter-btn')) {
        this.panel.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this._filter = e.target.dataset.filter;
        this.applyFilters();
      }
    });
  }

  applyFilters() {
    const filter = this._filter || "all";
    const search = this._search || "";
    const cards = this.panel.querySelectorAll('.journal-card');
    cards.forEach(card => {
      const matchesFilter = filter === 'all' ||
                   (filter === 'caught' && card.classList.contains('caught')) ||
                   (filter === 'uncaught' && card.classList.contains('uncaught')) ||
                   (card.dataset.rarity === filter);
      const matchesSearch = !search || (card.dataset.name && card.dataset.name.includes(search));
      card.style.display = (matchesFilter && matchesSearch) ? 'block' : 'none';
    });
  }

  hide() {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }
}
