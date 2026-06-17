// Daily Login UI - Streak tracker and reward claim

import { S } from "../state/gameState.js";
import { checkDailyLogin, claimDailyReward, getDailyRewardPreview } from "../progression/dailyLogin.js";
import { formatMoney } from "../utils/utils.js";
import { addMoney } from "../economy/economy.js";
import { saveGame } from "../state/saveLoad.js";
import { audio } from "../audio/audioManager.js";

export class DailyLoginUI {
  constructor() {
    this.panel = null;
  }

  show() {
    if (!S.dailyLogin) return;
    
    const check = checkDailyLogin(S.dailyLogin);
    
    this.panel = document.createElement("div");
    this.panel.id = "daily-login-panel";
    this.panel.className = "modal-overlay";
    
    this.panel.innerHTML = `
      <div class="modal-content daily-login-modal">
        <div class="modal-header">
          <h2>🔥 Daily Rewards</h2>
          <button class="btn-close">×</button>
        </div>
        
        <div class="streak-display">
          <div class="streak-flame">🔥</div>
          <div class="streak-number">${S.dailyLogin.streak}</div>
          <div class="streak-label">Day Streak</div>
        </div>
        
        ${check.canClaim ? `
          <div class="reward-available">
            <h3>Today's Reward</h3>
            <div class="reward-preview">
              <div class="reward-amount">${formatMoney(100 + Math.floor(S.dailyLogin.streak / 7) * 50)}</div>
              ${(S.dailyLogin.streak + 1) % 7 === 0 || (S.dailyLogin.streak + 1) % 30 === 0 ? 
                '<div class="bonus-badge">+ BONUS!</div>' : ''}
            </div>
            <button class="btn-claim-daily">Claim Reward</button>
          </div>
        ` : `
          <div class="reward-claimed">
            <div class="checkmark">✓</div>
            <p>Already claimed today!</p>
            <p class="next-reward">Come back tomorrow for Day ${S.dailyLogin.streak + 1}</p>
          </div>
        `}
        
        <div class="streak-calendar">
          <h3>This Week</h3>
          <div class="calendar-grid">
            ${Array.from({length: 7}, (_, i) => {
              const day = i + 1;
              const claimed = day <= (S.dailyLogin.streak % 7 || 7);
              return `
                <div class="calendar-day ${claimed ? 'claimed' : ''}">
                  <div class="day-number">Day ${day}</div>
                  ${claimed ? '<div class="day-check">✓</div>' : ''}
                  ${day === 7 ? '<div class="day-bonus">🎁</div>' : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
        
        <div class="milestone-tracker">
          <h3>Upcoming Milestones</h3>
          <div class="milestones">
            ${this.renderMilestones(S.dailyLogin.streak)}
          </div>
        </div>
        
        <div class="login-stats">
          <div class="stat-item">
            <span class="stat-label">Total Logins:</span>
            <span class="stat-value">${S.dailyLogin.totalLogins}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Best Streak:</span>
            <span class="stat-value">${S.dailyLogin.streak} days</span>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.panel);
    this.bindEvents();
  }

  renderMilestones(current) {
    const milestones = [
      { day: 7, reward: '1,000 $TIDE', label: 'Week 1' },
      { day: 14, reward: '2,500 $TIDE', label: 'Week 2' },
      { day: 30, reward: '10,000 $TIDE', label: 'Month 1' },
      { day: 60, reward: '10,000 $TIDE', label: 'Month 2' },
      { day: 90, reward: '10,000 $TIDE', label: 'Month 3' },
    ];
    
    return milestones
      .filter(m => current < m.day)
      .slice(0, 3)
      .map(m => `
        <div class="milestone ${current >= m.day ? 'complete' : ''}">
          <div class="milestone-day">Day ${m.day}</div>
          <div class="milestone-label">${m.label}</div>
          <div class="milestone-reward">${m.reward}</div>
          <div class="milestone-progress">${current}/${m.day}</div>
        </div>
      `).join('');
  }

  bindEvents() {
    const closeBtn = this.panel.querySelector('.btn-close');
    closeBtn.addEventListener('click', () => this.hide());
    
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
      
      if (e.target.classList.contains('btn-claim-daily')) {
        const result = claimDailyReward(S.dailyLogin);
        if (result) {
          audio.play("dailyLogin");
          let totalReward = 0;
          result.rewards.forEach(r => {
            if (r.type === 'money') totalReward += r.amount;
          });
          addMoney(totalReward);
          saveGame();
          this.hide();
          this.showClaimAnimation(result);
        }
      }
    });
  }

  showClaimAnimation(result) {
    const toast = document.createElement('div');
    toast.className = 'daily-reward-toast';
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon">🎁</div>
        <div class="toast-text">
          <div class="toast-title">Day ${result.streak} Reward Claimed!</div>
          ${result.rewards.map(r => `
            <div class="toast-reward">${r.label}: ${formatMoney(r.amount)}</div>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  hide() {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }
}
