// Achievements UI - Badge collection and progress tracker

import { S, events } from "../state/gameState.js";
import { ACHIEVEMENTS, checkAchievements, getAchievementProgress } from "../progression/achievements.js";
import { formatMoney } from "../utils/utils.js";
import { getGameStats, addMoney } from "../economy/economy.js";
import { saveGame } from "../state/saveLoad.js";
import { audio } from "../audio/audioManager.js";

export class AchievementsUI {
  constructor() {
    this.panel = null;
  }

  init() {
    // Listen for achievement unlocks
    events.on("achievements:unlocked", (achievements) => {
      this.showUnlockToast(achievements);
    });
  }

  isOpen() {
    return !!this.panel || !!document.getElementById("achievements-panel");
  }

  show() {
    if (!S.achievements) return;
    // Never stack panels: clear any existing instance (and stray orphans from
    // earlier rapid opens) before creating a fresh one.
    this.hide();

    this.panel = document.createElement("div");
    this.panel.id = "achievements-panel";
    this.panel.className = "modal-overlay";
    
    const stats = getGameStats();
    const progress = getAchievementProgress(stats);
    
    // Mark which are unlocked
    progress.forEach(ach => {
      ach.unlocked = S.achievements.unlocked.includes(ach.id);
    });
    
    const unlocked = progress.filter(a => a.unlocked).length;
    const totalRewards = ACHIEVEMENTS.filter(a => S.achievements.unlocked.includes(a.id))
      .reduce((sum, a) => sum + a.reward, 0);
    
    this.panel.innerHTML = `
      <div class="modal-content achievements-modal">
        <div class="modal-header">
          <h2>🏆 Achievements</h2>
          <button class="btn-close">×</button>
        </div>
        
        <div class="achievements-stats">
          <div class="stat-box">
            <div class="stat-value">${unlocked}/${ACHIEVEMENTS.length}</div>
            <div class="stat-label">Unlocked</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${Math.round((unlocked / ACHIEVEMENTS.length) * 100)}%</div>
            <div class="stat-label">Completion</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${formatMoney(totalRewards)}</div>
            <div class="stat-label">Total Rewards</div>
          </div>
        </div>
        
        <div class="achievements-filters">
          <button class="filter-btn active" data-filter="all">All</button>
          <button class="filter-btn" data-filter="unlocked">Unlocked</button>
          <button class="filter-btn" data-filter="locked">Locked</button>
        </div>
        
        <div class="achievements-grid">
          ${progress.map(ach => this.renderAchievement(ach)).join('')}
        </div>
      </div>
    `;
    
    document.body.appendChild(this.panel);
    this.bindEvents();
  }

  renderAchievement(ach) {
    const unlocked = ach.unlocked;
    const hasProgress = ach.progress && ach.progress.target;
    const progressPercent = hasProgress ? 
      Math.min(100, (ach.progress.current / ach.progress.target) * 100) : 0;
    
    return `
      <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
        <div class="achievement-icon">${unlocked ? ach.icon : '🔒'}</div>
        <div class="achievement-content">
          <h4 class="achievement-title">${unlocked ? ach.label : '???'}</h4>
          <p class="achievement-desc">${unlocked ? ach.desc : 'Hidden achievement'}</p>
          ${hasProgress && !unlocked ? `
            <div class="achievement-progress">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${progressPercent}%"></div>
              </div>
              <div class="progress-text">${ach.progress.current}/${ach.progress.target}</div>
            </div>
          ` : ''}
          ${unlocked && ach.reward > 0 ? `
            <div class="achievement-reward">Reward: ${formatMoney(ach.reward)}</div>
          ` : ''}
        </div>
      </div>
    `;
  }

  bindEvents() {
    const closeBtn = this.panel.querySelector('.btn-close');
    closeBtn.addEventListener('click', () => this.hide());
    
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
      
      if (e.target.classList.contains('filter-btn')) {
        this.panel.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.applyFilter(e.target.dataset.filter);
      }
    });

    // Close on Escape. Capture phase so this beats the global keydown handler,
    // which would otherwise pause the game (the panel doesn't change phase).
    this._escHandler = (e) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        this.hide();
      }
    };
    document.addEventListener('keydown', this._escHandler, true);
  }

  applyFilter(filter) {
    const cards = this.panel.querySelectorAll('.achievement-card');
    cards.forEach(card => {
      const show = filter === 'all' ||
                   (filter === 'unlocked' && card.classList.contains('unlocked')) ||
                   (filter === 'locked' && card.classList.contains('locked'));
      card.style.display = show ? 'flex' : 'none';
    });
  }

  showUnlockToast(achievements) {
    achievements.forEach((ach, i) => {
      setTimeout(() => {
        audio.play("achievement");
        if (ach.reward > 0) {
          addMoney(ach.reward);
        }
        
        const toast = document.createElement('div');
        toast.className = 'achievement-toast';
        toast.innerHTML = `
          <div class="toast-content">
            <div class="toast-icon-large">${ach.icon}</div>
            <div class="toast-text">
              <div class="toast-title">Achievement Unlocked!</div>
              <div class="toast-subtitle">${ach.label}</div>
              <div class="toast-desc">${ach.desc}</div>
              ${ach.reward > 0 ? `<div class="toast-reward">+${formatMoney(ach.reward)}</div>` : ''}
            </div>
          </div>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
      }, i * 1000);
    });
    
    saveGame();
  }

  hide() {
    // Remove the tracked panel plus any stray duplicates left by earlier opens,
    // so the menu can never get into an un-closeable stacked state.
    document.querySelectorAll('#achievements-panel').forEach((el) => el.remove());
    this.panel = null;
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler, true);
      this._escHandler = null;
    }
  }
}
