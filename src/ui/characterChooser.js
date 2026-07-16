// Shared "choose your character" UI: a turntable preview of the selected voxel
// body plus a grid of selectable characters and a confirm button. Used both in
// onboarding (step 2, after naming) and from the Profile (change character).
//
// Mount it into any container; it returns a handle with dispose() (which tears
// down the WebGL preview) and getSelected().

import { CHARACTERS, getCharacter, DEFAULT_CHARACTER } from "../data/characters.js";
import { createCharacterPreview } from "./characterPreview.js";
import { isAnglerOwned } from "../economy/economy.js";
import { events } from "../state/gameState.js";
import { formatMoney } from "../utils/utils.js";

export function mountCharacterChooser(container, opts = {}) {
  const confirmLabel = opts.confirmLabel || "Confirm";
  const onConfirm = typeof opts.onConfirm === "function" ? opts.onConfirm : () => {};
  const onCancel = typeof opts.onCancel === "function" ? opts.onCancel : null;
  const cancelLabel = opts.cancelLabel || "Cancel";
  let selected =
    opts.initial && getCharacter(opts.initial).id === opts.initial && isAnglerOwned(opts.initial)
      ? opts.initial
      : DEFAULT_CHARACTER;

  container.innerHTML = `
    <div class="cc-root">
      <div class="cc-stage" aria-label="Character preview">
        <div class="cc-spinner"></div>
      </div>
      <div class="cc-info">
        <h3 class="cc-name"></h3>
        <p class="cc-blurb"></p>
      </div>
      <div class="cc-grid" role="listbox" aria-label="Choose your character">
        ${CHARACTERS.map((c) => {
          const locked = !isAnglerOwned(c.id);
          return `
          <button type="button" class="cc-chip${locked ? " is-locked" : ""}" role="option" data-id="${c.id}" data-locked="${locked ? "1" : ""}" aria-selected="false"${locked ? ` title="Unlock in Shop → Anglers (${formatMoney(c.price)} $TIDAL)"` : ""}>
            <span class="cc-chip-emoji">${c.emoji || "🎣"}</span>
            <span class="cc-chip-name">${c.name}</span>
            ${locked ? `<span class="cc-chip-lock">🔒</span>` : ""}
          </button>`;
        }).join("")}
      </div>
      <div class="cc-actions">
        ${onCancel ? `<button type="button" class="btn btn-secondary cc-cancel">${cancelLabel}</button>` : ""}
        <button type="button" class="btn btn-primary cc-confirm"></button>
      </div>
    </div>
  `;

  const stage = container.querySelector(".cc-stage");
  const nameEl = container.querySelector(".cc-name");
  const blurbEl = container.querySelector(".cc-blurb");
  const confirmBtn = container.querySelector(".cc-confirm");
  const cancelBtn = container.querySelector(".cc-cancel");
  const chips = Array.from(container.querySelectorAll(".cc-chip"));

  const preview = createCharacterPreview(stage);
  let previewId = "";

  function render() {
    const c = getCharacter(selected);
    nameEl.textContent = `${c.emoji || ""} ${c.name}`.trim();
    blurbEl.textContent = c.blurb || "";
    confirmBtn.textContent = confirmLabel.replace("{name}", c.name);
    chips.forEach((chip) => {
      const on = chip.dataset.id === selected;
      chip.classList.toggle("is-selected", on);
      chip.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (previewId !== c.id) {
      previewId = c.id;
      // Animated VRM avatars are large and expensive to parse/retarget. Loading
      // them inside the chooser can stall low-end/mobile browsers and make the
      // overlay feel frozen. Use a lightweight in-canvas stand-in here; the real
      // avatar still loads when the user confirms the selection in the game.
      if (c.vrm || c.fbx) preview.setPlaceholder({ yawDeg: c.yawDeg });
      else preview.setModel(c.url, { yawDeg: c.yawDeg });
    }
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      if (chip.dataset.locked) {
        const c = getCharacter(chip.dataset.id);
        events.emit("toast", { msg: `Unlock ${c.name} in Shop → Anglers (${formatMoney(c.price)} $TIDAL)`, kind: "warn" });
        return;
      }
      if (chip.dataset.id === selected) return;
      selected = chip.dataset.id;
      render();
    });
  });

  confirmBtn.addEventListener("click", () => onConfirm(selected));
  cancelBtn?.addEventListener("click", () => onCancel?.());
  const onKey = (e) => {
    if (e.key === "Escape" && onCancel) {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };
  window.addEventListener("keydown", onKey, true);

  render();

  return {
    getSelected: () => selected,
    dispose() {
      window.removeEventListener("keydown", onKey, true);
      preview.dispose();
    },
  };
}
