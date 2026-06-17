// Server-side catch validation - prevents offline fishing
// All catches must be approved by the server before being registered

import { currentPublicKey } from "./wallet.js";

const API_URL = import.meta.env.VITE_API_URL || "https://tidal-fishing.onrender.com";

let lastValidationCheck = 0;
let validationCache = { allowed: true, timestamp: 0 };
const CACHE_DURATION = 30_000; // 30 seconds

/**
 * Validate a catch with the server before allowing it to be registered.
 * Returns { allowed: boolean, error?: string }
 */
export async function validateCatch(speciesId, value) {
  const publicKey = currentPublicKey();
  
  // Require wallet connection
  if (!publicKey) {
    return { 
      allowed: false, 
      error: "Connect your wallet to fish" 
    };
  }

  const walletAddress = publicKey.toString();
  
  try {
    const response = await fetch(`${API_URL}/api/catch/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        walletAddress, 
        speciesId, 
        value 
      }),
    });

    const data = await response.json();
    
    if (response.status === 403 && data.banned) {
      // User is banned
      return {
        allowed: false,
        error: data.reason || "Account suspended",
        banned: true
      };
    }
    
    if (!response.ok || !data.allowed) {
      return {
        allowed: false,
        error: data.error || "Catch validation failed"
      };
    }

    lastValidationCheck = Date.now();
    validationCache = { allowed: true, timestamp: Date.now() };
    
    return { allowed: true };
  } catch (error) {
    console.error("[catch-validation] Network error:", error);
    
    // FAIL CLOSED: If server is unreachable, don't allow fishing
    return {
      allowed: false,
      error: "Server connection required. Please check your internet connection."
    };
  }
}

/**
 * Check if user is allowed to fish (cached check)
 */
export function canFishOffline() {
  // Always require online validation - no offline fishing
  return false;
}

/**
 * Show ban message to user
 */
export function showBanMessage(reason) {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.style.zIndex = "10000";
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px; text-align: center; padding: 40px;">
      <h2 style="color: #ff4444; margin-bottom: 20px;">🚫 Account Suspended</h2>
      <p style="margin-bottom: 20px; font-size: 18px;">${reason}</p>
      <p style="color: #999; font-size: 14px;">
        If you believe this is an error, please contact support.
      </p>
      <button class="btn btn-primary" style="margin-top: 30px;" onclick="window.location.reload()">
        Reload
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
}
