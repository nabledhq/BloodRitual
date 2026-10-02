/**
 * Keyboard bindings, keyed by action. Values are `KeyboardEvent.code`s, which
 * name physical keys, so WASD stays in the same place on non-QWERTY layouts.
 */
export const KEY_BINDINGS = Object.freeze({
  forward: Object.freeze(['KeyW', 'ArrowUp']),
  backward: Object.freeze(['KeyS', 'ArrowDown']),
  left: Object.freeze(['KeyA', 'ArrowLeft']),
  right: Object.freeze(['KeyD', 'ArrowRight']),
  sprint: Object.freeze(['ShiftLeft', 'ShiftRight']),
  jump: Object.freeze(['Space']),
  crouch: Object.freeze(['KeyC']),
});

/** Toggles the How to Play panel. */
export const HELP_KEY = 'KeyH';

/** Talks to the villager the player is standing next to (and closes the menu again). */
export const INTERACT_KEY = 'KeyE';

/** Toggles the reputation panel. */
export const REPUTATION_KEY = 'KeyR';

/** Picks an option in the villager menu: the first code picks option 1, and so on. */
export const MENU_OPTION_KEYS = Object.freeze(['Digit1', 'Digit2', 'Digit3', 'Digit4']);

const ACTION_BY_CODE = new Map(
  Object.entries(KEY_BINDINGS).flatMap(([action, codes]) => codes.map((code) => [code, action])),
);

/** Returns the action bound to a `KeyboardEvent.code`, or `undefined`. */
export function actionForCode(code) {
  return ACTION_BY_CODE.get(code);
}

/**
 * Turns a set of held key codes into a movement intent:
 * `forward` and `right` are each -1, 0 or 1 (opposite keys cancel out), and
 * `sprint` / `crouch` are booleans. Jumping is edge-triggered, so it is not
 * part of the held-key intent (see `KeyboardInput#consumeJump`).
 */
export function movementIntent(pressedCodes) {
  const held = new Set();
  for (const code of pressedCodes) {
    const action = actionForCode(code);
    if (action) held.add(action);
  }
  return {
    forward: (held.has('forward') ? 1 : 0) - (held.has('backward') ? 1 : 0),
    right: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
    sprint: held.has('sprint'),
    crouch: held.has('crouch'),
  };
}

/**
 * Tracks which bound keys are held. Attach it to `window` (or any event
 * target) and read `getIntent()` once per frame.
 */
export class KeyboardInput {
  constructor(target) {
    this.target = target;
    this.pressed = new Set();
    this.jumpQueued = false;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.reset = this.reset.bind(this);
  }

  attach() {
    this.target.addEventListener('keydown', this.handleKeyDown);
    this.target.addEventListener('keyup', this.handleKeyUp);
    // Keys released while the window is unfocused never send keyup.
    this.target.addEventListener('blur', this.reset);
  }

  detach() {
    this.target.removeEventListener('keydown', this.handleKeyDown);
    this.target.removeEventListener('keyup', this.handleKeyUp);
    this.target.removeEventListener('blur', this.reset);
    this.reset();
  }

  handleKeyDown(event) {
    const action = actionForCode(event.code);
    if (!action) return;
    // Leave browser shortcuts such as Ctrl+S or Cmd+D alone.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // Stop arrows and Space from scrolling the page.
    event.preventDefault?.();
    if (action === 'jump' && !event.repeat && !this.pressed.has(event.code)) {
      this.jumpQueued = true;
    }
    this.pressed.add(event.code);
  }

  handleKeyUp(event) {
    this.pressed.delete(event.code);
  }

  /** Forgets every held key, e.g. when the window loses focus. */
  reset() {
    this.pressed.clear();
    this.jumpQueued = false;
  }

  /** Returns true once per Space press, then clears it. */
  consumeJump() {
    const jump = this.jumpQueued;
    this.jumpQueued = false;
    return jump;
  }

  /** The current movement intent including a one-shot `jump` flag. */
  getIntent() {
    return { ...movementIntent(this.pressed), jump: this.consumeJump() };
  }
}
