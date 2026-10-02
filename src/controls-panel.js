import { KEY_BINDINGS, HELP_KEY, DEBUG_KEYS } from './input.js';

/** Human-readable names for the key codes used in `KEY_BINDINGS`. */
const KEY_LABELS = {
  KeyW: 'W',
  KeyA: 'A',
  KeyS: 'S',
  KeyD: 'D',
  KeyC: 'C',
  KeyH: 'H',
  KeyN: 'N',
  KeyM: 'M',
  KeyB: 'B',
  KeyG: 'G',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  Space: 'Space',
};

/** Display labels for a list of key codes, without duplicates (e.g. both Shifts). */
export function keyLabels(codes) {
  return [...new Set(codes.map((code) => KEY_LABELS[code] ?? code))];
}

/**
 * Every control that works in the game, in the order the panel and the
 * README list them. Keyboard keys come straight from `KEY_BINDINGS`.
 */
export const CONTROLS = Object.freeze([
  { action: 'Move forward', keys: keyLabels(KEY_BINDINGS.forward) },
  { action: 'Move back', keys: keyLabels(KEY_BINDINGS.backward) },
  { action: 'Move left', keys: keyLabels(KEY_BINDINGS.left) },
  { action: 'Move right', keys: keyLabels(KEY_BINDINGS.right) },
  { action: 'Run (hold)', keys: keyLabels(KEY_BINDINGS.sprint) },
  { action: 'Jump', keys: keyLabels(KEY_BINDINGS.jump) },
  { action: 'Crouch (hold)', keys: keyLabels(KEY_BINDINGS.crouch) },
  { action: 'Look around', keys: ['Drag mouse'] },
  { action: 'Zoom', keys: ['Scroll'] },
  { action: 'Show / hide this panel', keys: keyLabels([HELP_KEY]) },
  { action: 'Select next villager (debug)', keys: keyLabels([DEBUG_KEYS.selectNpc]) },
  { action: 'Play next animation on villager (debug)', keys: keyLabels([DEBUG_KEYS.nextAction]) },
  { action: 'Return villager to routine (debug)', keys: keyLabels([DEBUG_KEYS.resumeNpc]) },
  { action: 'Show / hide FPS and NPC info (debug)', keys: keyLabels([DEBUG_KEYS.overlay]) },
]);

/** Short tips for combining keys. */
export const CONTROL_HINTS = Object.freeze([
  'Use WASD or the arrow keys to move.',
  'Hold Shift while moving to run.',
  'Press Space while moving to jump over obstacles.',
  'Hold C to crouch.',
]);

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Markup for the How to Play panel. */
export function renderControlsPanel(controls = CONTROLS, hints = CONTROL_HINTS) {
  const rows = controls
    .map(({ action, keys }) => {
      const keyHtml = keys.map((key) => `<kbd>${escapeHtml(key)}</kbd>`).join(' / ');
      return `<tr><th scope="row">${escapeHtml(action)}</th><td>${keyHtml}</td></tr>`;
    })
    .join('');
  const tips = hints.map((hint) => `<li>${escapeHtml(hint)}</li>`).join('');
  return (
    '<div class="controls-header">' +
    '<h2 id="controls-title">How to Play</h2>' +
    '<button type="button" class="controls-close" data-controls-close aria-label="Close How to Play">&times;</button>' +
    '</div>' +
    `<table class="controls-table"><tbody>${rows}</tbody></table>` +
    `<ul class="controls-hints">${tips}</ul>`
  );
}

/**
 * The How to Play panel. It is shown when the game starts and toggled with
 * `H` (or closed with its close button).
 */
export class ControlsPanel {
  constructor(root, { target = window, visible = true } = {}) {
    this.root = root;
    this.target = target;
    this.onKeyDown = this.onKeyDown.bind(this);
    this.hide = this.hide.bind(this);

    root.setAttribute?.('role', 'dialog');
    root.setAttribute?.('aria-labelledby', 'controls-title');
    root.innerHTML = renderControlsPanel();
    this.closeButton = root.querySelector('[data-controls-close]');
    this.closeButton?.addEventListener('click', this.hide);
    target.addEventListener('keydown', this.onKeyDown);
    this.root.hidden = !visible;
  }

  get visible() {
    return !this.root.hidden;
  }

  show() {
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }

  toggle() {
    this.root.hidden = !this.root.hidden;
  }

  onKeyDown(event) {
    if (event.code !== HELP_KEY || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    this.toggle();
  }

  dispose() {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.closeButton?.removeEventListener('click', this.hide);
  }
}
