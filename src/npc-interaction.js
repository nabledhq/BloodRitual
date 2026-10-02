import { INTERACT_KEY, MENU_OPTION_KEYS } from './input.js';
import { INTERACTION } from './config.js';
import { escapeHtml } from './controls-panel.js';

/** Signed score change for display, e.g. "+10" or "−5". */
export function formatDelta(delta) {
  return delta > 0 ? `+${delta}` : `\u2212${Math.abs(delta)}`;
}

/** The NPC nearest to `position` (on the ground plane) within `radius`, or null. */
export function nearestNpc(position, npcs, radius) {
  let best = null;
  let bestDistance = radius;
  for (const npc of npcs) {
    if (!npc.userData.faction) continue;
    const d = Math.hypot(npc.position.x - position.x, npc.position.z - position.z);
    if (d <= bestDistance) {
      best = npc;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Talking to villagers. Each frame `update()` finds the villager next to the
 * player and shows a hint; `E` then opens a small menu of sample actions
 * (from `npcMenu` in the reputation data). Choosing one (number key or
 * click) applies that action to the reputation. Villagers whose faction will
 * not talk to the player (Hostile) refuse instead of showing the menu.
 *
 * `state` is one of `idle` (nobody near), `hint`, `menu` or `refused`.
 */
export class NpcInteraction {
  constructor({ reputation, element = null, target = window, options = reputation.config.npcMenu, settings = INTERACTION }) {
    this.reputation = reputation;
    this.element = element;
    this.target = target;
    this.options = options;
    this.settings = settings;
    this.state = 'idle';
    this.npc = null;
    this.lastResult = null;
    this.html = null;

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onClick = this.onClick.bind(this);
    target.addEventListener('keydown', this.onKeyDown);
    element?.addEventListener?.('click', this.onClick);
    this.unsubscribe = reputation.onReputationChanged(() => this.render());
    this.render();
  }

  get isOpen() {
    return this.state === 'menu' || this.state === 'refused';
  }

  /** Keeps the hint and any open menu in step with where the player is. */
  update(playerPosition, npcs) {
    if (this.isOpen) {
      const d = Math.hypot(this.npc.position.x - playerPosition.x, this.npc.position.z - playerPosition.z);
      if (d <= this.settings.leaveRadius) return;
    }
    const npc = nearestNpc(playerPosition, npcs, this.settings.radius);
    this.setState(npc ? 'hint' : 'idle', npc);
  }

  setState(state, npc) {
    if (state === this.state && npc === this.npc) return;
    if (npc !== this.npc) this.lastResult = null;
    this.state = state;
    this.npc = npc;
    this.render();
  }

  /** Opens the menu for the villager nearby (or their refusal). Returns the new state. */
  open() {
    if (!this.npc) return this.state;
    this.setState(this.reputation.willTalk(this.npc.userData.faction) ? 'menu' : 'refused', this.npc);
    return this.state;
  }

  /** Closes the menu, going back to the hint for the same villager. */
  close() {
    if (!this.isOpen) return;
    this.lastResult = null;
    this.setState(this.npc ? 'hint' : 'idle', this.npc);
  }

  /** Applies menu option `index` (0-based). Returns the reputation changes, or null if nothing was chosen. */
  choose(index) {
    const option = this.options[index];
    if (this.state !== 'menu' || !option) return null;
    const changes = this.reputation.applyAction(option.action);
    this.lastResult = { option, changes };
    // The action may have turned this villager's faction hostile.
    this.state = this.reputation.willTalk(this.npc.userData.faction) ? 'menu' : 'refused';
    this.render();
    return changes;
  }

  onKeyDown(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === INTERACT_KEY) {
      if (this.isOpen) this.close();
      else this.open();
    } else if (event.code === 'Escape') {
      this.close();
    } else if (this.state === 'menu') {
      const index = MENU_OPTION_KEYS.indexOf(event.code?.replace('Numpad', 'Digit'));
      if (index >= 0) this.choose(index);
    }
  }

  onClick(event) {
    const button = event.target?.closest?.('[data-option]');
    if (button) this.choose(Number(button.dataset.option));
  }

  factionLabel(faction) {
    return this.reputation.factions.find((f) => f.id === faction)?.label ?? faction;
  }

  /** Markup for the current state ('' when idle). */
  renderHtml() {
    if (this.state === 'idle' || !this.npc) return '';
    const { faction } = this.npc.userData;
    const name = escapeHtml(this.npc.userData.interactive?.label ?? 'Villager');
    const standing = `${escapeHtml(this.factionLabel(faction))} \u00b7 ${escapeHtml(this.reputation.getTierInfo(faction).label)}`;
    const header = `<div class="npc-menu-header"><strong>${name}</strong><span class="npc-faction">${standing}</span></div>`;

    if (this.state === 'hint') {
      return `<p class="npc-hint">Press <kbd>E</kbd> to talk to the ${name.toLowerCase()} <span class="npc-faction">${standing}</span></p>`;
    }

    let result = '';
    if (this.lastResult) {
      const { option, changes } = this.lastResult;
      const summary = changes.length
        ? changes.map((c) => `${escapeHtml(this.factionLabel(c.faction))} ${formatDelta(c.delta)}`).join(', ')
        : 'no change';
      result = `<p class="npc-result">${escapeHtml(option.label)}: ${summary}</p>`;
    }

    if (this.state === 'refused') {
      return (
        header +
        `<p class="npc-refusal">The ${name.toLowerCase()} turns away and will not speak with you. ` +
        `The ${escapeHtml(this.factionLabel(faction))} are hostile to you.</p>` +
        result +
        '<p class="npc-footer">Press <kbd>E</kbd> to close</p>'
      );
    }

    const buttons = this.options
      .map(
        (option, i) =>
          `<li><button type="button" data-option="${i}"><kbd>${i + 1}</kbd> ${escapeHtml(option.label)}</button></li>`,
      )
      .join('');
    return (
      header +
      `<ol class="npc-options">${buttons}</ol>` +
      result +
      '<p class="npc-footer">Press a number or click to choose &middot; <kbd>E</kbd> to close</p>'
    );
  }

  render() {
    if (!this.element) return;
    const html = this.renderHtml();
    if (html === this.html) return;
    this.html = html;
    this.element.innerHTML = html;
    this.element.hidden = html === '';
    if (this.element.dataset) this.element.dataset.state = this.state;
  }

  dispose() {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.element?.removeEventListener?.('click', this.onClick);
    this.unsubscribe();
  }
}
