// Tournament UI - Competitive timed fishing events

import { S, events } from "../state/gameState.js";
import { getTournamentSchedule, startTournament, updateTournamentScore, endTournament, formatTournamentScore, TOURNAMENT_TYPES } from "../progression/tournament.js";
import { formatMoney } from "../utils/utils.js";
import { audio } from "../audio/audioManager.js";
import { saveGame } from "../state/saveLoad.js";
import { isOnChainPayEnabled, payTide } from "../web3/payment.js";
import { explorerTxUrl, shortAddress } from "../web3/solana.js";

export class TournamentUI {
  constructor() {
    this.widget = null;
    this.countdownInterval = null;
    this.active = false;
    this.dismissed = false;
    this.lastShown = 0;
    this.joining = false; // true while an on-chain entry payment is in flight
    this.SHOW_INTERVAL = 10 * 60 * 1000; // Show every 10 minutes
  }

  init() {
    // Create tournament widget
    this.widget = document.createElement('div');
    this.widget.id = 'tournament-widget';
    this.widget.className = 'tournament-widget';
    document.body.appendChild(this.widget);

    this.render();
    
    // Update every second
    setInterval(() => this.render(), 1000);
  }

  dismiss() {
    this.dismissed = true;
    this.lastShown = Date.now();
    this.widget.style.display = 'none';
  }

  shouldShow() {
    const now = Date.now();
    const timeSinceLastShown = now - this.lastShown;
    
    // If dismissed, wait for the interval
    if (this.dismissed && timeSinceLastShown < this.SHOW_INTERVAL) {
      return false;
    }
    
    // Reset dismissed flag after interval
    if (timeSinceLastShown >= this.SHOW_INTERVAL) {
      this.dismissed = false;
    }
    
    return true;
  }

  render() {
    if (!this.widget) return;

    // While an on-chain join payment is in flight, don't rebuild the widget —
    // otherwise the disabled "Joining…" button gets replaced by a fresh,
    // clickable one and the user could pay the entry fee twice.
    if (this.joining) return;

    const schedule = getTournamentSchedule();
    const timeUntil = schedule.timeUntil;
    const tournament = S.tournament?.currentTournament;

    // If tournament is active - always show (can't dismiss during active tournament)
    if (tournament && tournament.started && !tournament.ended) {
      this.widget.style.display = 'block';
      const timeLeft = tournament.endTime - Date.now();
      if (timeLeft <= 0) {
        this.endActiveTournament();
        return;
      }

      this.widget.innerHTML = `
        <div class="tournament-active">
          <div class="tournament-header">
            <span class="tournament-icon">🏆</span>
            <span class="tournament-title">${tournament.type.name}</span>
          </div>
          <div class="tournament-timer ${timeLeft < 30000 ? 'urgent' : ''}">
            ${this.formatTime(timeLeft)}
          </div>
          <div class="tournament-score">
            Score: ${formatTournamentScore(tournament.score, tournament.type.scoring)}
          </div>
          <div class="tournament-catches">
            ${tournament.catches.length} catches
          </div>
        </div>
      `;

      // Play countdown sounds for last 10 seconds
      if (timeLeft < 10000 && timeLeft > 9000) {
        const secondsLeft = Math.floor(timeLeft / 1000);
        audio.play("countdown", { intensity: (10 - secondsLeft) / 10 });
      }

      return;
    }

    // Check if widget should be shown (10 minute interval)
    if (!this.shouldShow()) {
      this.widget.style.display = 'none';
      return;
    }

    // Update lastShown timestamp on first render after interval
    if (!this.dismissed && Date.now() - this.lastShown >= this.SHOW_INTERVAL) {
      this.lastShown = Date.now();
    }

    // If tournament is upcoming
    if (timeUntil < 15 * 60 * 1000) { // Show 15 minutes before
      this.widget.style.display = 'block';
      this.widget.innerHTML = `
        <div class="tournament-upcoming">
          <button class="tournament-close" aria-label="Close">×</button>
          <div class="tournament-header">
            <span class="tournament-icon">🏆</span>
            <span class="tournament-title">Tournament</span>
          </div>
          <div class="tournament-name">${schedule.nextTournament.name}</div>
          <div class="tournament-countdown">Starts in ${this.formatTime(timeUntil)}</div>
          <div class="tournament-details">
            <div class="detail-item">
              <span class="detail-label">Entry:</span>
              <span class="detail-value">${formatMoney(schedule.nextTournament.entryFee)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Duration:</span>
              <span class="detail-value">${schedule.nextTournament.duration / 60000}m</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">1st Prize:</span>
              <span class="detail-value">${formatMoney(schedule.nextTournament.prizePool[0])}</span>
            </div>
          </div>
          ${timeUntil < 60000 ? `<button class="btn-join-tournament">🏆 Join · ${formatMoney(schedule.nextTournament.entryFee)}</button>` : ''}
        </div>
      `;

      // Add close button handler
      this.widget.querySelector('.tournament-close')?.addEventListener('click', () => {
        this.dismiss();
      });

      if (timeUntil < 60000) {
        this.widget.querySelector('.btn-join-tournament')?.addEventListener('click', () => {
          this.joinTournament(schedule.nextTournament);
        });
      }
    } else {
      // Show compact timer for next tournament
      this.widget.style.display = 'block';
      this.widget.innerHTML = `
        <div class="tournament-upcoming tournament-compact">
          <button class="tournament-close" aria-label="Close">×</button>
          <div class="tournament-header">
            <span class="tournament-icon">🏆</span>
            <span class="tournament-title">Next Tournament</span>
          </div>
          <div class="tournament-name">${schedule.nextTournament.name}</div>
          <div class="tournament-countdown-compact">in ${this.formatTimeCompact(timeUntil)}</div>
        </div>
      `;

      // Add close button handler
      this.widget.querySelector('.tournament-close')?.addEventListener('click', () => {
        this.dismiss();
      });
    }
  }

  formatTimeCompact(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  async joinTournament(tournamentType) {
    // Entry is paid in REAL on-chain $TIDE (transferred to the treasury),
    // exactly like equipment/map unlocks — NOT in-game money. payTide() reads
    // the wallet balance across both SPL Token and Token-2022 and throws with a
    // precise "have X, need Y" message if there genuinely aren't enough tokens.
    if (!isOnChainPayEnabled()) {
      audio.play("error");
      this.showToast("Connect your wallet to join tournaments", "error");
      return;
    }

    this.joining = true;
    const joinBtn = this.widget?.querySelector('.btn-join-tournament');
    if (joinBtn) {
      joinBtn.disabled = true;
      joinBtn.textContent = "Joining…";
    }

    try {
      const sig = await payTide(tournamentType.entryFee, { memo: `tidal:tournament:${tournamentType.id}` });

      // Initialize + start tournament only after payment confirms on-chain.
      S.tournament.currentTournament = {
        type: tournamentType,
        entryFee: tournamentType.entryFee,
        started: false,
        score: 0,
        catches: [],
      };
      startTournament(S.tournament.currentTournament);
      audio.play("tournamentStart");
      saveGame();

      events.emit("toast", {
        msg: `Joined ${tournamentType.name} — ${formatMoney(tournamentType.entryFee)} · ${shortAddress(sig, 6, 6)}`,
        kind: "gold",
        href: explorerTxUrl(sig),
      });
      events.emit("wallet:refresh");
      this.joining = false;
      this.render();
    } catch (e) {
      console.error("[tidal] tournament join failed", e);
      audio.play("error");
      this.showToast(e?.message ?? "On-chain payment failed", "error");
      this.joining = false;
      this.render();
    }
  }

  endActiveTournament() {
    const tournament = S.tournament.currentTournament;
    if (!tournament) return;

    const result = endTournament(tournament);
    audio.play("tournamentEnd");

    // Show results
    this.showResults(result);

    // Clear current tournament
    S.tournament.currentTournament = null;
    S.tournament.totalParticipations += 1;
    
    // Add to history
    S.tournament.history.unshift({
      type: result.type.name,
      score: result.score,
      catches: result.catches,
      timestamp: Date.now(),
    });

    // Keep only last 10 tournaments
    if (S.tournament.history.length > 10) {
      S.tournament.history = S.tournament.history.slice(0, 10);
    }

    saveGame();
    this.render();
  }

  showResults(result) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content tournament-results-modal">
        <div class="modal-header">
          <h2>🏆 Tournament Complete!</h2>
        </div>
        <div class="results-content">
          <div class="results-title">${result.type.name}</div>
          <div class="results-score">
            <div class="score-label">Final Score</div>
            <div class="score-value">${formatTournamentScore(result.score, result.type.scoring)}</div>
          </div>
          <div class="results-stats">
            <div class="stat-item">
              <span class="stat-label">Total Catches:</span>
              <span class="stat-value">${result.catches}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Duration:</span>
              <span class="stat-value">${this.formatTime(result.duration || result.type.duration)}</span>
            </div>
          </div>
          <p class="results-note">Check global leaderboards to see your ranking!</p>
          <button class="btn btn-primary">Continue Fishing</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    
    modal.querySelector('.btn-primary').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  showToast(message, type = "info") {
    const toast = document.createElement('div');
    toast.className = `tournament-toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  destroy() {
    if (this.widget) {
      this.widget.remove();
      this.widget = null;
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }
}
