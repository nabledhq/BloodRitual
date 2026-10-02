import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONTROLS, CONTROL_HINTS, ControlsPanel, renderControlsPanel, keyLabels } from '../src/controls-panel.js';
import { KEY_BINDINGS, HELP_KEY, INTERACT_KEY, REPUTATION_KEY } from '../src/input.js';

function decode(html) {
  return html.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Parses the rendered panel back into `{ action, keys }` rows. */
function panelRows(html) {
  return [...html.matchAll(/<tr><th scope="row">(.*?)<\/th><td>(.*?)<\/td><\/tr>/g)].map(([, action, keys]) => ({
    action: decode(action),
    keys: [...keys.matchAll(/<kbd>(.*?)<\/kbd>/g)].map(([, k]) => decode(k)),
  }));
}

function readmeControlsSection() {
  const readme = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
  const match = readme.match(/^## Controls\n([\s\S]*?)(?=^## )/m);
  expect(match, 'README has a "## Controls" section').not.toBeNull();
  return match[1];
}

describe('CONTROLS', () => {
  it('lists every movement action with both primary and alternate keys', () => {
    const byAction = Object.fromEntries(CONTROLS.map((c) => [c.action, c.keys]));
    expect(byAction['Move forward']).toEqual(['W', '↑']);
    expect(byAction['Move back']).toEqual(['S', '↓']);
    expect(byAction['Move left']).toEqual(['A', '←']);
    expect(byAction['Move right']).toEqual(['D', '→']);
    expect(byAction['Run (hold)']).toEqual(['Shift']);
    expect(byAction['Jump']).toEqual(['Space']);
    expect(byAction['Crouch (hold)']).toEqual(['C']);
    expect(byAction['Talk to a villager']).toEqual(['E']);
    expect(byAction['Show / hide reputation']).toEqual(['R']);
  });

  it('covers every key binding the game listens to', () => {
    const listed = new Set(CONTROLS.flatMap((c) => c.keys));
    for (const codes of [...Object.values(KEY_BINDINGS), [HELP_KEY], [INTERACT_KEY], [REPUTATION_KEY]]) {
      for (const label of keyLabels(codes)) expect(listed.has(label), label).toBe(true);
    }
  });

  it('does not advertise mechanics that do not exist yet', () => {
    const actions = CONTROLS.map((c) => c.action.toLowerCase()).join(' ');
    for (const missing of ['attack', 'pause']) expect(actions).not.toContain(missing);
    const keys = CONTROLS.flatMap((c) => c.keys);
    for (const missing of ['F', 'Esc', 'LMB']) expect(keys).not.toContain(missing);
  });

  it('includes the combination hints', () => {
    expect(CONTROL_HINTS).toEqual([
      'Use WASD or the arrow keys to move.',
      'Hold Shift while moving to run.',
      'Press Space while moving to jump over obstacles.',
      `Hold ${keyLabels(KEY_BINDINGS.crouch)[0]} to crouch.`,
      `Stand next to a villager and press ${keyLabels([INTERACT_KEY])[0]}, then a number key to choose what to do.`,
      `What you do changes how each group sees you; press ${keyLabels([REPUTATION_KEY])[0]} to see where you stand.`,
    ]);
  });
});

describe('renderControlsPanel', () => {
  it('renders exactly the implemented actions with their keys', () => {
    const html = renderControlsPanel();
    expect(html).toContain('How to Play');
    expect(panelRows(html)).toEqual(CONTROLS.map(({ action, keys }) => ({ action, keys })));
  });

  it('renders the hints', () => {
    const html = renderControlsPanel();
    for (const hint of CONTROL_HINTS) expect(html).toContain(`<li>${hint}</li>`);
  });

  it('escapes text', () => {
    const html = renderControlsPanel([{ action: '<b>', keys: ['&'] }], []);
    expect(html).not.toContain('<b>');
    expect(panelRows(html)).toEqual([{ action: '<b>', keys: ['&'] }]);
  });
});

describe('README', () => {
  it('has a Controls section matching the panel', () => {
    const section = readmeControlsSection();
    const rows = section
      .split('\n')
      .filter((line) => line.startsWith('|'))
      .slice(2) // header and separator
      .map((line) => {
        const [action, keys] = line.split('|').slice(1, 3).map((cell) => cell.trim());
        return { action, keys: keys.split(' / ').map((k) => k.replace(/`/g, '')) };
      });
    expect(rows).toEqual(CONTROLS.map(({ action, keys }) => ({ action, keys })));
    for (const hint of CONTROL_HINTS) expect(section).toContain(`- ${hint}`);
  });
});

describe('ControlsPanel', () => {
  function fakeRoot() {
    const closeButton = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    return {
      innerHTML: '',
      hidden: true,
      closeButton,
      setAttribute: vi.fn(),
      querySelector: vi.fn(() => closeButton),
    };
  }

  it('is shown on start with the controls rendered inside', () => {
    const root = fakeRoot();
    const panel = new ControlsPanel(root, { target: new EventTarget() });
    expect(panel.visible).toBe(true);
    expect(root.hidden).toBe(false);
    expect(root.innerHTML).toBe(renderControlsPanel());
  });

  it('toggles with H', () => {
    const target = new EventTarget();
    const root = fakeRoot();
    const panel = new ControlsPanel(root, { target });
    const press = (code, extra = {}) => target.dispatchEvent(Object.assign(new Event('keydown'), { code, ...extra }));
    press('KeyH');
    expect(panel.visible).toBe(false);
    press('KeyW');
    expect(panel.visible).toBe(false);
    press('KeyH', { repeat: true });
    expect(panel.visible).toBe(false);
    press('KeyH');
    expect(panel.visible).toBe(true);
    panel.dispose();
    press('KeyH');
    expect(panel.visible).toBe(true);
  });

  it('closes with its close button', () => {
    const root = fakeRoot();
    const panel = new ControlsPanel(root, { target: new EventTarget() });
    const [event, handler] = root.closeButton.addEventListener.mock.calls[0];
    expect(event).toBe('click');
    handler();
    expect(panel.visible).toBe(false);
  });
});
