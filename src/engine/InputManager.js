import { KeyboardInput } from '../input.js';

/**
 * Player input: keyboard movement intents (bindings in src/input.js; the
 * same keys as before the migration) and the pointer position over the
 * canvas for pointing at things. Mouse orbit and wheel zoom are handled by
 * the camera's own Babylon.js inputs.
 */
export class InputManager {
  constructor({ keyTarget = globalThis.window, canvas = null } = {}) {
    this.keyboard = new KeyboardInput(keyTarget);
    this.keyboard.attach();
    this.canvas = canvas;
    /** Pointer position in canvas pixels, or null when it is outside. */
    this.pointer = null;
    this.onPointerMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    this.onPointerLeave = () => {
      this.pointer = null;
    };
    canvas?.addEventListener('pointermove', this.onPointerMove);
    canvas?.addEventListener('pointerleave', this.onPointerLeave);
  }

  /** The current movement intent (`{ forward, right, sprint, crouch, jump }`). */
  getIntent() {
    return this.keyboard.getIntent();
  }

  dispose() {
    this.keyboard.detach();
    this.canvas?.removeEventListener('pointermove', this.onPointerMove);
    this.canvas?.removeEventListener('pointerleave', this.onPointerLeave);
  }
}
