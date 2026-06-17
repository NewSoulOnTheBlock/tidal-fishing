// Profile UI - Player profile editor with achievements and badges

import { S, events } from "../state/gameState.js";
import { currentPublicKey } from "../web3/wallet.js";
import { updateProfile, getPlayerProfile } from "../web3/database.js";
import { saveGame } from "../state/saveLoad.js";
import { PROFILE_AVATARS, getAvatar } from "../data/profileAvatars.js";
import { ACHIEVEMENTS } from "../progression/achievements.js";
import { formatMoney } from "../utils/utils.js";
import { shortAddress } from "../web3/solana.js";

export class ProfileUI {
  constructor() {
    this.panel = null;
    this.isEditing = false;
    this.currentProfile = null;
  }

  /** Build a profile object from local game state — used as the source of
   *  truth so edits work instantly and even when the API server is down. */
  buildLocalProfile(walletAddress) {
    return {
      player: {
        wallet_address: walletAddress,
        username: S.profile.username || "",
        bio: S.profile.bio || "",
        profile_picture: S.profile.avatar || "default",
        level: S.profile.level ?? 1,
        xp: S.profile.xp ?? 0,
        money: Math.floor(S.profile.money ?? 0),
        total_catches: S.stats?.catches ?? 0,
        total_earned: S.stats?.earned ?? 0,
        perfect_hooks: S.stats?.perfectHooks ?? 0,
        login_streak: S.dailyLogin?.streak ?? 0,
        created_at: S.profile.createdAt || new Date().toISOString(),
      },
      achievements: (S.achievements?.unlocked || []).map((id) => ({ achievement_id: id })),
    };
  }

  async show() {
    const publicKey = currentPublicKey();

    if (!publicKey) {
      events.emit("toast", {
        msg: "Connect your wallet to view your profile",
        kind: "warn",
      });
      return;
    }

    const walletAddress = publicKey.toString();

    // Local state is the source of truth (instant, offline-safe).
    this.currentProfile = this.buildLocalProfile(walletAddress);

    // Best-effort: merge any server-side values on top (achievements, stats).
    try {
      const remote = await getPlayerProfile(walletAddress);
      if (remote?.player) {
        // Prefer locally-edited identity fields; fill the rest from server.
        this.currentProfile = {
          player: {
            ...remote.player,
            username: S.profile.username || remote.player.username || "",
            bio: S.profile.bio || remote.player.bio || "",
            profile_picture: S.profile.avatar || remote.player.profile_picture || "default",
          },
          achievements: remote.achievements?.length
            ? remote.achievements
            : this.currentProfile.achievements,
        };
      }
    } catch (e) {
      console.warn("[ProfileUI] Using local profile (server unavailable):", e?.message);
    }

    this.panel = document.createElement("div");
    this.panel.id = "profile-panel";
    this.panel.className = "modal-overlay";
    this.panel.innerHTML = this.renderProfile();
    document.body.appendChild(this.panel);
    this.bindEvents();
  }

  renderProfile() {
    const { player, achievements } = this.currentProfile;
    const avatar = getAvatar(player.profile_picture || 'default');
    
    const unlockedAchievements = new Set(achievements.map(a => a.achievement_id));
    const totalAchievements = ACHIEVEMENTS.length;
    const unlockedCount = unlockedAchievements.size;
    const completionPercent = Math.round((unlockedCount / totalAchievements) * 100);

    return `
      <div class="modal-content profile-modal">
        <div class="modal-header">
          <h2>👤 Profile</h2>
          <button class="btn-close">×</button>
        </div>
        
        <div class="profile-content">
          <!-- Profile Header -->
          <div class="profile-header">
            <div class="profile-avatar-section">
              <div class="profile-avatar-large" style="background: ${avatar.color}">
                <span class="avatar-emoji">${avatar.emoji}</span>
              </div>
              <button class="btn btn-secondary btn-change-avatar">Change Avatar</button>
            </div>
            
            <div class="profile-info-section">
              <div class="profile-username-row">
                <h3 class="profile-username">${player.username || shortAddress(player.wallet_address)}</h3>
                <button class="btn btn-icon btn-edit-username" title="Edit username">✏️</button>
              </div>
              
              <div class="profile-wallet">
                <span class="wallet-label">Wallet:</span>
                <span class="wallet-addr">${shortAddress(player.wallet_address)}</span>
              </div>
              
              <div class="profile-bio">
                <div class="bio-text">${player.bio || '<em>No bio set. Click to add one!</em>'}</div>
                <button class="btn btn-icon btn-edit-bio" title="Edit bio">✏️</button>
              </div>
            </div>
          </div>

          <!-- Stats Grid -->
          <div class="profile-stats-grid">
            <div class="stat-card">
              <div class="stat-icon">⚡</div>
              <div class="stat-value">${player.level}</div>
              <div class="stat-label">Level</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon">🎣</div>
              <div class="stat-value">${player.total_catches}</div>
              <div class="stat-label">Catches</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon">💰</div>
              <div class="stat-value">${formatMoney(player.total_earned)}</div>
              <div class="stat-label">Earned</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon">⚡</div>
              <div class="stat-value">${player.perfect_hooks}</div>
              <div class="stat-label">Perfect Hooks</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon">🔥</div>
              <div class="stat-value">${player.login_streak}</div>
              <div class="stat-label">Login Streak</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon">🏆</div>
              <div class="stat-value">${unlockedCount}/${totalAchievements}</div>
              <div class="stat-label">Achievements</div>
            </div>
          </div>

          <!-- Achievements Section -->
          <div class="profile-achievements">
            <div class="achievements-header">
              <h4>🏆 Achievements</h4>
              <div class="achievements-progress">
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${completionPercent}%"></div>
                </div>
                <span class="progress-text">${completionPercent}% Complete</span>
              </div>
            </div>
            
            <div class="achievements-grid">
              ${ACHIEVEMENTS.map(ach => {
                const unlocked = unlockedAchievements.has(ach.id);
                return `
                  <div class="achievement-badge ${unlocked ? 'unlocked' : 'locked'}">
                    <div class="badge-icon">${ach.icon}</div>
                    <div class="badge-info">
                      <div class="badge-label">${ach.label}</div>
                      <div class="badge-desc">${ach.desc}</div>
                      ${ach.reward > 0 ? `<div class="badge-reward">+${formatMoney(ach.reward)}</div>` : ''}
                    </div>
                    ${unlocked ? '<div class="badge-check">✓</div>' : '<div class="badge-lock">🔒</div>'}
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Member Since -->
          <div class="profile-footer">
            <span class="member-since">Member since ${new Date(player.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const closeBtn = this.panel.querySelector('.btn-close');
    closeBtn.addEventListener('click', () => this.hide());

    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    const editUsernameBtn = this.panel.querySelector('.btn-edit-username');
    if (editUsernameBtn) {
      editUsernameBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.editUsername();
      });
    }

    const editBioBtn = this.panel.querySelector('.btn-edit-bio');
    if (editBioBtn) {
      editBioBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.editBio();
      });
    }

    const changeAvatarBtn = this.panel.querySelector('.btn-change-avatar');
    if (changeAvatarBtn) {
      changeAvatarBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectAvatar();
      });
    }
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * In-DOM input modal. Native prompt()/confirm() are suppressed by browsers
   * when the PWA runs in standalone display mode, so we render our own.
   * Resolves with the entered string, or null if cancelled.
   */
  openInputModal({ title, label, value = '', maxLength = 100, multiline = false }) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'input-modal-overlay';

      const safeValue = this.escapeHtml(value);
      const field = multiline
        ? `<textarea class="input-modal-field" maxlength="${maxLength}" rows="4">${safeValue}</textarea>`
        : `<input type="text" class="input-modal-field" maxlength="${maxLength}" value="${safeValue}" />`;

      modal.innerHTML = `
        <div class="input-modal-content">
          <h3>${this.escapeHtml(title)}</h3>
          <label class="input-modal-label">${this.escapeHtml(label)}</label>
          ${field}
          <div class="input-modal-counter"><span class="char-count">${value.length}</span>/${maxLength}</div>
          <div class="input-modal-actions">
            <button class="btn btn-secondary btn-modal-cancel">Cancel</button>
            <button class="btn btn-primary btn-modal-save">Save</button>
          </div>
        </div>
      `;

      this.panel.appendChild(modal);

      const input = modal.querySelector('.input-modal-field');
      const counter = modal.querySelector('.char-count');
      setTimeout(() => { input.focus(); input.select?.(); }, 0);

      input.addEventListener('input', () => {
        counter.textContent = input.value.length;
      });

      const close = (result) => {
        modal.remove();
        resolve(result);
      };

      modal.querySelector('.btn-modal-cancel').addEventListener('click', () => close(null));
      modal.querySelector('.btn-modal-save').addEventListener('click', () => close(input.value));

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !multiline) {
          e.preventDefault();
          close(input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close(null);
        }
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) close(null);
      });
    });
  }

  /**
   * Persist a profile change. Local game state is the source of truth so the
   * edit takes effect (and survives reload) even when the API server is down;
   * the server sync is best-effort and never blocks the edit.
   */
  async persistProfile(localPatch, serverPatch) {
    Object.assign(S.profile, localPatch);
    try {
      saveGame();
    } catch (e) {
      console.warn('[ProfileUI] saveGame failed:', e?.message);
    }

    const publicKey = currentPublicKey();
    if (publicKey) {
      try {
        await updateProfile(publicKey.toString(), serverPatch);
      } catch (e) {
        console.warn('[ProfileUI] Remote profile sync failed (saved locally):', e?.message);
      }
    }
  }

  async editUsername() {
    const currentUsername = this.currentProfile.player.username || '';
    const newUsername = await this.openInputModal({
      title: 'Edit Username',
      label: 'Username (max 30 characters)',
      value: currentUsername,
      maxLength: 30,
    });

    if (newUsername === null) return;
    const trimmed = newUsername.trim();
    if (trimmed === currentUsername) return;

    this.currentProfile.player.username = trimmed;
    await this.persistProfile({ username: trimmed }, { username: trimmed });
    events.emit('toast', { msg: '✅ Username updated!', kind: 'success' });
    this.refresh();
  }

  async editBio() {
    const currentBio = this.currentProfile.player.bio || '';
    const newBio = await this.openInputModal({
      title: 'Edit Bio',
      label: 'Bio (max 200 characters)',
      value: currentBio,
      maxLength: 200,
      multiline: true,
    });

    if (newBio === null) return;
    const trimmed = newBio.trim();
    if (trimmed === currentBio) return;

    this.currentProfile.player.bio = trimmed;
    await this.persistProfile({ bio: trimmed }, { bio: trimmed });
    events.emit('toast', { msg: '✅ Bio updated!', kind: 'success' });
    this.refresh();
  }

  selectAvatar() {
    // Create avatar picker modal
    const picker = document.createElement('div');
    picker.className = 'avatar-picker-modal';
    
    picker.innerHTML = `
      <div class="avatar-picker-content">
        <h3>Choose Your Avatar</h3>
        <div class="avatar-grid">
          ${PROFILE_AVATARS.map(avatar => `
            <button class="avatar-option" data-avatar="${avatar.id}" style="background: ${avatar.color}">
              <span class="avatar-emoji">${avatar.emoji}</span>
              <span class="avatar-label">${avatar.label}</span>
            </button>
          `).join('')}
        </div>
        <button class="btn btn-secondary btn-cancel">Cancel</button>
      </div>
    `;
    
    this.panel.appendChild(picker);
    
    picker.querySelector('.btn-cancel').addEventListener('click', () => {
      picker.remove();
    });
    
    picker.querySelectorAll('.avatar-option').forEach(btn => {
      btn.addEventListener('click', async () => {
        const avatarId = btn.dataset.avatar;
        await this.updateAvatar(avatarId);
        picker.remove();
      });
    });
  }

  async updateAvatar(avatarId) {
    this.currentProfile.player.profile_picture = avatarId;
    await this.persistProfile({ avatar: avatarId }, { profilePicture: avatarId });
    events.emit('toast', { msg: '✅ Avatar updated!', kind: 'success' });
    this.refresh();
  }

  refresh() {
    if (!this.panel) return;
    this.panel.innerHTML = this.renderProfile();
    this.bindEvents();
  }

  hide() {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }
}
