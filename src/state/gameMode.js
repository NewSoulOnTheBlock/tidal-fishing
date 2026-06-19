// Game mode: Casual Angler vs Pro Angler.
//
//   Casual — just play. No bait is required to cast and catches are purely
//            recreational: they still fill the Journal and stats, but earn no
//            $TIDE, aren't server-validated, and aren't added to the sellable
//            catch bag (catch & release).
//   Pro    — the full economy. Every cast spends one bait, catches are
//            server-validated and worth real $TIDE you can sell.
//
// Persisted on S.profile.mode. New anglers start in Casual so anyone can fish
// right away; flip to Pro from the HUD to play for value.

import { S, events } from "./gameState.js";
import { saveGame } from "./saveLoad.js";

/** Current mode, defaulting to "casual" for any save without the field. */
export function getMode() {
  return S.profile?.mode === "pro" ? "pro" : "casual";
}

/** True when the player is fishing for real $TIDE value (bait required). */
export function isPro() {
  return getMode() === "pro";
}

/** Set the mode (validated), persist, and broadcast. Returns the applied mode. */
export function setMode(mode) {
  const next = mode === "pro" ? "pro" : "casual";
  if (S.profile && S.profile.mode !== next) {
    S.profile.mode = next;
    try {
      saveGame();
    } catch {
      /* storage may be blocked; in-memory switch still applies */
    }
    events.emit("mode", { mode: next });
  }
  return next;
}

/** Flip between Casual and Pro. Returns the new mode. */
export function toggleMode() {
  return setMode(isPro() ? "casual" : "pro");
}
