const BUTTON = {
  SOUTH: 0,
  EAST: 1,
  WEST: 2,
  NORTH: 3,
  LEFT_SHOULDER: 4,
  RIGHT_SHOULDER: 5,
  LEFT_TRIGGER: 6,
  RIGHT_TRIGGER: 7,
  SELECT: 8,
  START: 9,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
};

const AXIS = {
  LEFT_X: 0,
};

const DEADZONE = 0.22;
const AIM_SPEED = 0.58;
const TRIGGER_THRESHOLD = 0.45;

function axisValue(gamepad, index) {
  const value = Number(gamepad?.axes?.[index] || 0);
  return Math.abs(value) < DEADZONE ? 0 : value;
}

function buttonPressed(gamepad, index) {
  const button = gamepad?.buttons?.[index];
  if (!button) return false;
  return !!button.pressed || Number(button.value || 0) >= TRIGGER_THRESHOLD;
}

export class GamepadInput {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.gamepadIndex = null;
    this.previous = new Map();
    this.aimNorm = 0.5;
    this.connectedName = "";
    this.primaryHeld = false;

    window.addEventListener("gamepadconnected", (event) => this.connect(event.gamepad));
    window.addEventListener("gamepaddisconnected", (event) => this.disconnect(event.gamepad));
  }

  connect(gamepad) {
    if (!gamepad) return;
    this.gamepadIndex = gamepad.index;
    this.connectedName = gamepad.id || "Gamepad";
    this.previous.clear();
    this.callbacks.onConnect?.(this.connectedName);
  }

  disconnect(gamepad) {
    if (gamepad?.index !== this.gamepadIndex) return;
    if (this.primaryHeld) this.callbacks.onPrimaryUp?.();
    this.callbacks.onDisconnect?.(this.connectedName || "Gamepad");
    this.gamepadIndex = null;
    this.connectedName = "";
    this.primaryHeld = false;
    this.previous.clear();
  }

  getGamepad() {
    const pads = navigator.getGamepads?.() || [];
    if (this.gamepadIndex !== null && pads[this.gamepadIndex]) return pads[this.gamepadIndex];
    const first = Array.from(pads).find(Boolean);
    if (first) this.connect(first);
    return first || null;
  }

  pressed(gamepad, index) {
    return buttonPressed(gamepad, index);
  }

  edge(gamepad, index) {
    const pressed = this.pressed(gamepad, index);
    const was = this.previous.get(index) || false;
    this.previous.set(index, pressed);
    return pressed && !was;
  }

  release(gamepad, index) {
    const pressed = this.pressed(gamepad, index);
    const was = this.previous.get(index) || false;
    this.previous.set(index, pressed);
    return !pressed && was;
  }

  update(dt, context = {}) {
    const gamepad = this.getGamepad();
    if (!gamepad) return;

    const leftX = axisValue(gamepad, AXIS.LEFT_X);
    const dpadLeft = this.pressed(gamepad, BUTTON.DPAD_LEFT);
    const dpadRight = this.pressed(gamepad, BUTTON.DPAD_RIGHT);

    if (context.canAim) {
      this.aimNorm = Math.max(0, Math.min(1, this.aimNorm + leftX * AIM_SPEED * dt));
      this.callbacks.onAim?.(this.aimNorm);
    }

    if (context.canSteer) {
      const dpadSteer = dpadLeft ? -1 : dpadRight ? 1 : 0;
      const stickSteer = Math.abs(leftX) > 0 ? Math.sign(leftX) : 0;
      this.callbacks.onSteer?.(dpadSteer || stickSteer);
    }

    const reelHeld = this.pressed(gamepad, BUTTON.SOUTH) || this.pressed(gamepad, BUTTON.RIGHT_TRIGGER);
    if (reelHeld && !this.primaryHeld) {
      this.primaryHeld = true;
      this.callbacks.onPrimaryDown?.();
    }
    if (!reelHeld && this.primaryHeld) {
      this.primaryHeld = false;
      this.callbacks.onPrimaryUp?.();
    }

    if (this.edge(gamepad, BUTTON.EAST)) this.callbacks.onDodge?.();
    if (this.edge(gamepad, BUTTON.WEST)) this.callbacks.onRetrieve?.();
    if (this.edge(gamepad, BUTTON.NORTH) || this.edge(gamepad, BUTTON.DPAD_UP)) this.callbacks.onHeave?.();

    if (this.edge(gamepad, BUTTON.START)) this.callbacks.onPause?.();
    if (this.edge(gamepad, BUTTON.SELECT)) this.callbacks.onControls?.();
    if (this.edge(gamepad, BUTTON.LEFT_SHOULDER)) this.callbacks.onBag?.();
    if (this.edge(gamepad, BUTTON.RIGHT_SHOULDER)) this.callbacks.onQuests?.();
  }
}
