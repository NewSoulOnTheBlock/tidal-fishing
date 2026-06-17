// Daily Challenges UI - Quest tracker with progress bars

import { S, events } from "../state/gameState.js";
import { rollDailyChallenges, getCompletedChallenges } from "../progression/challenges.js";
import { formatMoney } from "../utils/utils.js";
import { addMoney } from "../economy/economy.js";
import { saveGame } from "../state/saveLoad.js";
import { audio } from "../audio/audioManager.js";

export class ChallengesUI {
  constructor() {
    this.widget = null;
  }

  init() {
    if (!S.challenges) return;
    
    // Roll daily challenges if needed
    rollDailyChallenges(S.challenges);
    
    // Create persistent widget
    this.widget = document.createElement('div');
    this.widget.id = 'challenges-widget';
    this.widget.className = 'challenges-widget';
    document.body.appendChild(this.widget);
    
    this.render();
    
    // Listen for challenge completion
    events.on("challenge:complete", () => {
      this.render();
      this.showCompletionToast();
    });
  }

  render() {
    if (!this.widget || !S.challenges) return;
    
    const challenges = S.challenges.dailySet;
    const completed = challenges.filter(c => c.completed).length;
    
    this.widget.innerHTML = `
      <div class="widget-header" onclick="this.parentElement.classList.toggle('expanded')">
        <span class="widget-title">📋 Daily Challenges</span>
        <span class="widget-progress">${completed}/3</span>
      </div>
      <div class="widget-body">
        ${challenges.map(c => this.renderChallenge(c)).join('')}
      </div>
    `;
  }

  renderChallenge(challenge) {
    const progress = Math.min(100, (challenge.progress / challenge.target) * 100);
    const completed = challenge.completed;
    
    return `
      <div class="challenge-item ${completed ? 'completed' : ''}">
        <div class="challenge-header">
          <span class="challenge-label">${challenge.label}</span>
          ${completed ? 
            '<span class="challenge-check">✓</span>' : 
            `<span class="challenge-reward">${formatMoney(challenge.reward)}</span>`
          }
        </div>
        <div class="challenge-progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
          <span class="progress-text">${challenge.progress}/${challenge.target}</span>
        </div>
      </div>
    `;
  }

  showCompletionToast() {
    const completed = getCompletedChallenges(S.challenges);
    if (completed.length === 0) return;
    
    audio.play("challenge");
    
    completed.forEach(c => {
      addMoney(c.reward);
      
      const toast = document.createElement('div');
      toast.className = 'challenge-toast';
      toast.innerHTML = `
        <div class="toast-content">
          <div class="toast-icon">✨</div>
          <div class="toast-text">
            <div class="toast-title">Challenge Complete!</div>
            <div class="toast-subtitle">${c.label}</div>
            <div class="toast-reward">+${formatMoney(c.reward)}</div>
          </div>
        </div>
      `;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    });
    
    saveGame();
  }

  destroy() {
    if (this.widget) {
      this.widget.remove();
      this.widget = null;
    }
  }
}
