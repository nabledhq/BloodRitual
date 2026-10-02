import { describe, it, expect, vi } from 'vitest';
import { createReputation, REPUTATION_CONFIG } from '../src/reputation.js';
import { NpcInteraction, nearestNpc, formatDelta } from '../src/npc-interaction.js';
import { ReputationPanel, renderReputationPanel } from '../src/reputation-panel.js';
import { INTERACTION } from '../src/config.js';

function npc(name, faction, x, z, label = 'Villager') {
  return { name, position: { x, y: 0, z }, userData: { faction, interactive: { label } } };
}

function fakeElement() {
  return { innerHTML: '', hidden: true, dataset: {}, addEventListener: vi.fn(), removeEventListener: vi.fn(), setAttribute: vi.fn() };
}

function setup() {
  const target = new EventTarget();
  const element = fakeElement();
  const reputation = createReputation();
  const interaction = new NpcInteraction({ reputation, element, target });
  const press = (code, extra = {}) => target.dispatchEvent(Object.assign(new Event('keydown'), { code, ...extra }));
  return { target, element, reputation, interaction, press };
}

/** Parses the reputation panel markup into `{ faction: [score, tier] }`. */
function panelValues(html) {
  return Object.fromEntries(
    [...html.matchAll(/<tr data-faction="(\w+)"><th scope="row">.*?<\/th><td class="rep-score">(.*?)<\/td><td class="[^"]*">(.*?)<\/td><\/tr>/g)].map(
      ([, faction, score, tier]) => [faction, [Number(score), tier]],
    ),
  );
}

describe('nearestNpc', () => {
  it('picks the closest villager within the radius', () => {
    const a = npc('a', 'traders', 1.5, 0);
    const b = npc('b', 'farmers', 0, 1);
    const far = npc('far', 'farmers', 10, 0);
    expect(nearestNpc({ x: 0, z: 0 }, [a, b, far], 2)).toBe(b);
    expect(nearestNpc({ x: 9, z: 0 }, [a, b, far], 2)).toBe(far);
    expect(nearestNpc({ x: 5, z: 5 }, [a, b, far], 2)).toBeNull();
    expect(nearestNpc({ x: 0, z: 0 }, [{ ...b, userData: {} }], 2)).toBeNull();
  });
});

describe('formatDelta', () => {
  it('signs the change', () => {
    expect(formatDelta(5)).toBe('+5');
    expect(formatDelta(-12)).toBe('\u221212');
  });
});

describe('NpcInteraction', () => {
  it('shows a hint next to a villager and nothing elsewhere', () => {
    const { interaction, element } = setup();
    const elder = npc('elder', 'seminole_families', 1, 0, 'Elder');
    interaction.update({ x: 0, z: 0 }, [elder]);
    expect(interaction.state).toBe('hint');
    expect(element.hidden).toBe(false);
    expect(element.innerHTML).toContain('Press <kbd>E</kbd> to talk to the elder');
    expect(element.innerHTML).toContain('Seminole families');
    expect(element.innerHTML).toContain('Neutral');
    interaction.update({ x: 10, z: 10 }, [elder]);
    expect(interaction.state).toBe('idle');
    expect(element.hidden).toBe(true);
  });

  it('opens the action menu with E near a villager, and E closes it', () => {
    const { interaction, element, press } = setup();
    press('KeyE');
    expect(interaction.state).toBe('idle');
    interaction.update({ x: 0, z: 0 }, [npc('t', 'traders', 1, 0)]);
    press('KeyE');
    expect(interaction.state).toBe('menu');
    expect(REPUTATION_CONFIG.npcMenu.length).toBeGreaterThanOrEqual(2);
    expect(REPUTATION_CONFIG.npcMenu.length).toBeLessThanOrEqual(4);
    for (const option of REPUTATION_CONFIG.npcMenu) expect(element.innerHTML).toContain(option.label);
    expect([...element.innerHTML.matchAll(/data-option="/g)]).toHaveLength(REPUTATION_CONFIG.npcMenu.length);
    press('KeyE', { repeat: true });
    expect(interaction.state).toBe('menu');
    press('KeyE');
    expect(interaction.state).toBe('hint');
    press('KeyE');
    press('Escape');
    expect(interaction.state).toBe('hint');
  });

  it('applies the chosen action with a number key or a click', () => {
    const { interaction, element, reputation, press } = setup();
    interaction.update({ x: 0, z: 0 }, [npc('t', 'traders', 1, 0)]);
    press('KeyE');
    press('Digit2');
    const second = REPUTATION_CONFIG.npcMenu[1];
    const expected = REPUTATION_CONFIG.actions[second.action].deltas;
    for (const [faction, delta] of Object.entries(expected)) expect(reputation.getReputation(faction)).toBe(delta);
    expect(interaction.state).toBe('menu');
    expect(element.innerHTML).toContain(`${second.label}:`);
    // Clicking a button does the same.
    const [, onClick] = element.addEventListener.mock.calls.find(([type]) => type === 'click');
    onClick({ target: { closest: () => ({ dataset: { option: '0' } }) } });
    const first = REPUTATION_CONFIG.actions[REPUTATION_CONFIG.npcMenu[0].action].deltas;
    for (const [faction, delta] of Object.entries(first)) {
      expect(reputation.getReputation(faction)).toBe(delta + (expected[faction] ?? 0));
    }
  });

  it('ignores number keys while the menu is closed', () => {
    const { interaction, reputation, press } = setup();
    interaction.update({ x: 0, z: 0 }, [npc('t', 'traders', 1, 0)]);
    press('Digit1');
    expect(reputation.snapshot()).toEqual(createReputation().snapshot());
  });

  it('refuses when the villager’s faction is hostile', () => {
    const { interaction, element, reputation, press } = setup();
    while (reputation.willTalk('farmers')) reputation.applyAction('steal');
    const before = reputation.snapshot();
    interaction.update({ x: 0, z: 0 }, [npc('f', 'farmers', 1, 0)]);
    press('KeyE');
    expect(interaction.state).toBe('refused');
    expect(element.innerHTML).toContain('will not speak with you');
    expect(element.innerHTML).not.toContain('data-option');
    press('Digit1');
    expect(reputation.snapshot()).toEqual(before);
    press('KeyE');
    expect(interaction.state).toBe('hint');
  });

  it('turns to a refusal when an action makes the faction hostile', () => {
    const { interaction, reputation, press } = setup();
    interaction.update({ x: 0, z: 0 }, [npc('f', 'farmers', 1, 0)]);
    press('KeyE');
    const steal = REPUTATION_CONFIG.npcMenu.findIndex((o) => o.action === 'steal');
    while (interaction.state === 'menu') interaction.choose(steal);
    expect(reputation.getTier('farmers')).toBe('hostile');
    expect(interaction.state).toBe('refused');
  });

  it('stays open while close and closes when the player walks away', () => {
    const { interaction } = setup();
    const v = npc('v', 'traders', 1, 0);
    interaction.update({ x: 0, z: 0 }, [v]);
    interaction.open();
    interaction.update({ x: 1 - INTERACTION.leaveRadius + 0.1, z: 0 }, [v]);
    expect(interaction.state).toBe('menu');
    interaction.update({ x: 1 - INTERACTION.leaveRadius - 0.1, z: 0 }, [v]);
    expect(interaction.state).toBe('idle');
  });

  it('stops listening on dispose', () => {
    const { interaction, press } = setup();
    interaction.update({ x: 0, z: 0 }, [npc('t', 'traders', 1, 0)]);
    interaction.dispose();
    press('KeyE');
    expect(interaction.state).toBe('hint');
  });
});

describe('ReputationPanel', () => {
  it('lists every faction with its score and tier', () => {
    const reputation = createReputation();
    const values = panelValues(renderReputationPanel(reputation));
    expect(Object.keys(values)).toEqual(REPUTATION_CONFIG.factions.map((f) => f.id));
    for (const v of Object.values(values)) expect(v).toEqual([0, 'Neutral']);
    expect(renderReputationPanel(reputation)).toContain('Authority attention');
  });

  it('is hidden on start, toggles with R and closes with its button', () => {
    const target = new EventTarget();
    const root = fakeElement();
    const panel = new ReputationPanel(root, createReputation(), { target });
    const press = (code, extra = {}) => target.dispatchEvent(Object.assign(new Event('keydown'), { code, ...extra }));
    expect(panel.visible).toBe(false);
    press('KeyR');
    expect(panel.visible).toBe(true);
    press('KeyR', { repeat: true });
    expect(panel.visible).toBe(true);
    press('KeyR', { ctrlKey: true });
    expect(panel.visible).toBe(true);
    const [, onClick] = root.addEventListener.mock.calls.find(([type]) => type === 'click');
    onClick({ target: { closest: (sel) => (sel === '[data-reputation-close]' ? {} : null) } });
    expect(panel.visible).toBe(false);
    panel.dispose();
    press('KeyR');
    expect(panel.visible).toBe(false);
  });

  it('updates live when reputation changes', () => {
    const reputation = createReputation();
    const root = fakeElement();
    new ReputationPanel(root, reputation, { target: new EventTarget() });
    reputation.applyAction('resist_authorities');
    const values = panelValues(root.innerHTML);
    const { deltas } = REPUTATION_CONFIG.actions.resist_authorities;
    expect(values.seminole_families[0]).toBe(deltas.seminole_families);
    expect(values.authorities[0]).toBe(deltas.authorities);
    while (reputation.getTier('traders') !== 'hostile') reputation.applyAction('trade_cheat');
    expect(panelValues(root.innerHTML).traders).toEqual([reputation.getReputation('traders'), 'Hostile']);
  });
});
