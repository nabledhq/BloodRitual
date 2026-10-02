import { describe, it, expect, vi } from 'vitest';
import { KEY_BINDINGS, actionForCode, movementIntent, KeyboardInput } from '../src/input.js';

function key(code, extra = {}) {
  return { code, preventDefault: vi.fn(), ...extra };
}

describe('movementIntent', () => {
  it.each([
    ['KeyW', { forward: 1, right: 0 }],
    ['ArrowUp', { forward: 1, right: 0 }],
    ['KeyS', { forward: -1, right: 0 }],
    ['ArrowDown', { forward: -1, right: 0 }],
    ['KeyA', { forward: 0, right: -1 }],
    ['ArrowLeft', { forward: 0, right: -1 }],
    ['KeyD', { forward: 0, right: 1 }],
    ['ArrowRight', { forward: 0, right: 1 }],
  ])('maps %s to the expected direction', (code, expected) => {
    expect(movementIntent([code])).toMatchObject(expected);
  });

  it('is idle when no keys are held', () => {
    expect(movementIntent([])).toEqual({ forward: 0, right: 0, sprint: false, crouch: false });
  });

  it('combines two directions into a diagonal', () => {
    expect(movementIntent(['KeyW', 'KeyD'])).toMatchObject({ forward: 1, right: 1 });
    expect(movementIntent(['ArrowDown', 'ArrowLeft'])).toMatchObject({ forward: -1, right: -1 });
  });

  it('cancels out opposite keys, including a primary and an alternate key', () => {
    expect(movementIntent(['KeyW', 'ArrowDown'])).toMatchObject({ forward: 0 });
    expect(movementIntent(['KeyA', 'KeyD'])).toMatchObject({ right: 0 });
  });

  it('does not double speed when both keys for one direction are held', () => {
    expect(movementIntent(['KeyW', 'ArrowUp'])).toMatchObject({ forward: 1 });
  });

  it('reads sprint from either Shift key and crouch from C', () => {
    expect(movementIntent(['ShiftLeft']).sprint).toBe(true);
    expect(movementIntent(['ShiftRight']).sprint).toBe(true);
    expect(movementIntent(['KeyC']).crouch).toBe(true);
  });

  it('ignores unbound keys', () => {
    expect(movementIntent(['KeyQ', 'Enter'])).toEqual(movementIntent([]));
    expect(actionForCode('KeyQ')).toBeUndefined();
  });

  it('binds every action to at least one key with no key used twice', () => {
    const codes = Object.values(KEY_BINDINGS).flat();
    expect(new Set(codes).size).toBe(codes.length);
    for (const [action, list] of Object.entries(KEY_BINDINGS)) {
      expect(list.length, action).toBeGreaterThan(0);
      for (const code of list) expect(actionForCode(code)).toBe(action);
    }
  });
});

describe('KeyboardInput', () => {
  it('tracks held keys through keydown and keyup', () => {
    const input = new KeyboardInput({});
    input.handleKeyDown(key('KeyW'));
    input.handleKeyDown(key('ShiftLeft'));
    expect(input.getIntent()).toMatchObject({ forward: 1, sprint: true });
    input.handleKeyUp(key('KeyW'));
    input.handleKeyUp(key('ShiftLeft'));
    expect(input.getIntent()).toMatchObject({ forward: 0, right: 0, sprint: false });
  });

  it('reports a jump once per Space press', () => {
    const input = new KeyboardInput({});
    input.handleKeyDown(key('Space'));
    expect(input.getIntent().jump).toBe(true);
    expect(input.getIntent().jump).toBe(false);
    // Auto-repeat while holding Space does not queue another jump.
    input.handleKeyDown(key('Space', { repeat: true }));
    expect(input.getIntent().jump).toBe(false);
    input.handleKeyUp(key('Space'));
    input.handleKeyDown(key('Space'));
    expect(input.getIntent().jump).toBe(true);
  });

  it('prevents page scrolling for bound keys only', () => {
    const input = new KeyboardInput({});
    const space = key('Space');
    const other = key('KeyQ');
    input.handleKeyDown(space);
    input.handleKeyDown(other);
    expect(space.preventDefault).toHaveBeenCalled();
    expect(other.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves browser shortcuts such as Ctrl+S alone', () => {
    const input = new KeyboardInput({});
    const event = key('KeyS', { ctrlKey: true });
    input.handleKeyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(input.getIntent().forward).toBe(0);
  });

  it('releases every key when the window loses focus', () => {
    const target = new EventTarget();
    const input = new KeyboardInput(target);
    input.attach();
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyD' }));
    expect(input.getIntent().right).toBe(1);
    target.dispatchEvent(new Event('blur'));
    expect(input.getIntent().right).toBe(0);
    input.detach();
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyD' }));
    expect(input.getIntent().right).toBe(0);
  });
});
