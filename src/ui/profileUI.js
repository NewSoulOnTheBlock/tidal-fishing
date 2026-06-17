// Profile UI - Player profile editor with achievements and badges

import { S, events } from "../state/gameState.js";
import { currentPublicKey } from "../web3/wallet.js";
import { updateProfile, getPlayerProfile } from "../web3/database.js";
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

  async show() {
    console.log("[ProfileUI] show() called");
    const publicKey = currentPublicKey();
    console.log("[ProfileUI] publicKey:", publicKey);
    
    if (!publicKey) {
      console.log("[ProfileUI] No wallet connected");
      events.emit("toast", { 
        msg: "Connect your wallet to view your profile", 
        kind: "warn" 
      });
      return;
    }

    const walletAddress = publicKey.toString();
    console.log("[ProfileUI] Loading profile for:", walletAddress);
    
    // Load profile from database
    this.currentProfile = await getPlayerProfile(walletAddress);
    console.log("[ProfileUI] Profile loaded:", this.currentProfile);
    
    if (!this.currentProfile) {
      console.log("[ProfileUI] Failed to load profile");
      events.emit("toast", { 
        msg: "Failed to load profile", 
        kind: "error" 
      });
      return;
    }

    console.log("[ProfileUI] Creating panel...");
    this.panel = document.createElement("div");
    this.panel.id = "profile-panel";
    this.panel.className = "modal-overlay";
    
    this.panel.innerHTML = this.renderProfile();
    
    console.log("[ProfileUI] Appending to body...");
    document.body.appendChild(this.panel);
    console.log("[ProfileUI] Panel appended, binding events...");
    this.bindEvents();
    console.log("[ProfileUI] Done!");
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
    console.log("[ProfileUI] bindEvents() called");
    const closeBtn = this.panel.querySelector('.btn-close');
    closeBtn.addEventListener('click', () => this.hide());
    
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) this.hide();
    });

    // Edit username
    const editUsernameBtn = this.panel.querySelector('.btn-edit-username');
    console.log("[ProfileUI] Edit username button:", editUsernameBtn);
    if (editUsernameBtn) {
      editUsernameBtn.addEventListener('click', (e) => {
        console.log("[ProfileUI] Username edit button clicked!");
        e.preventDefault();
        e.stopPropagation();
        this.editUsername();
      });
    }

    // Edit bio
    const editBioBtn = this.panel.querySelector('.btn-edit-bio');
    console.log("[ProfileUI] Edit bio button:", editBioBtn);
    if (editBioBtn) {
      editBioBtn.addEventListener('click', (e) => {
        console.log("[ProfileUI] Bio edit button clicked!");
        e.preventDefault();
        e.stopPropagation();
        this.editBio();
      });
    }

    // Change avatar
    const changeAvatarBtn = this.panel.querySelector('.btn-change-avatar');
    console.log("[ProfileUI] Change avatar button:", changeAvatarBtn);
    if (changeAvatarBtn) {
      changeAvatarBtn.addEventListener('click', (e) => {
        console.log("[ProfileUI] Change avatar button clicked!");
        e.preventDefault();
        e.stopPropagation();
        this.selectAvatar();
      });
    }
  }

  async editUsername() {
    console.log("[ProfileUI] editUsername() called");
    const currentUsername = this.currentProfile.player.username || '';
    console.log("[ProfileUI] Current username:", currentUsername);
    
    const newUsername = prompt('Enter your new username (max 50 characters):', currentUsername);
    console.log("[ProfileUI] New username from prompt:", newUsername);
    
    if (newUsername === null || newUsername === currentUsername) {
      console.log("[ProfileUI] Username unchanged, returning");
      return;
    }
    
    if (newUsername.length > 50) {
      console.log("[ProfileUI] Username too long");
      events.emit("toast", { 
        msg: "Username must be 50 characters or less", 
        kind: "error" 
      });
      return;
    }

    const publicKey = currentPublicKey();
    if (!publicKey) {
      console.log("[ProfileUI] No public key");
      return;
    }

    try {
      console.log("[ProfileUI] Updating username via API...");
      events.emit("toast", { 
        msg: "Updating username...", 
        kind: "info" 
      });

      const updated = await updateProfile(publicKey.toString(), { username: newUsername });
      console.log("[ProfileUI] Update result:", updated);
      
      if (updated) {
        this.currentProfile.player.username = newUsername;
        events.emit("toast", { 
          msg: "✅ Username updated!", 
          kind: "success" 
        });
        this.refresh();
      }
    } catch (error) {
      console.error("[ProfileUI] Update error:", error);
      events.emit("toast", { 
        msg: "Failed to update username", 
        kind: "error" 
      });
    }
  }

  async editBio() {
    const currentBio = this.currentProfile.player.bio || '';
    const newBio = prompt('Enter your bio (max 200 characters):', currentBio);
    
    if (newBio === null || newBio === currentBio) return;
    
    if (newBio.length > 200) {
      events.emit("toast", { 
        msg: "Bio must be 200 characters or less", 
        kind: "error" 
      });
      return;
    }

    const publicKey = currentPublicKey();
    if (!publicKey) return;

    try {
      events.emit("toast", { 
        msg: "Updating bio...", 
        kind: "info" 
      });

      const updated = await updateProfile(publicKey.toString(), { bio: newBio });
      
      if (updated) {
        this.currentProfile.player.bio = newBio;
        events.emit("toast", { 
          msg: "✅ Bio updated!", 
          kind: "success" 
        });
        this.refresh();
      }
    } catch (error) {
      events.emit("toast", { 
        msg: "Failed to update bio", 
        kind: "error" 
      });
    }
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
    const publicKey = currentPublicKey();
    if (!publicKey) return;

    try {
      events.emit("toast", { 
        msg: "Updating avatar...", 
        kind: "info" 
      });

      const updated = await updateProfile(publicKey.toString(), { profilePicture: avatarId });
      
      if (updated) {
        this.currentProfile.player.profile_picture = avatarId;
        events.emit("toast", { 
          msg: "✅ Avatar updated!", 
          kind: "success" 
        });
        this.refresh();
      }
    } catch (error) {
      events.emit("toast", { 
        msg: "Failed to update avatar", 
        kind: "error" 
      });
    }
  }

  refresh() {
    const content = this.panel.querySelector('.profile-content');
    content.innerHTML = this.renderProfile().match(/<div class="profile-content">([\s\S]*)<\/div>\s*<\/div>$/)[1];
    this.bindEvents();
  }

  hide() {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }
}
