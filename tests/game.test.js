import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// WebGL is not available under Node, so stand in a fake renderer and fake
// orbit controls. This exercises the Game wiring (scene, character, camera,
// loop) without needing a GPU.
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  class FakeWebGLRenderer {
    constructor() {
      this.domElement = { remove: vi.fn() };
      this.shadowMap = {};
      this.setPixelRatio = vi.fn();
      this.setSize = vi.fn();
      this.render = vi.fn();
      this.dispose = vi.fn();
      this.setAnimationLoop = vi.fn((fn) => {
        this.loop = fn;
      });
    }
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

vi.mock('three/examples/jsm/controls/OrbitControls.js', async () => {
  const { Vector3 } = await vi.importActual('three');
  return {
    OrbitControls: class {
      constructor() {
        this.target = new Vector3();
        this.update = vi.fn();
        this.dispose = vi.fn();
      }
    },
  };
});

const { Game } = await import('../src/game.js');
const { MOVEMENT } = await import('../src/config.js');
const { CHARACTER_HEIGHT } = await import('../src/character.js');

describe('Game', () => {
  let container;

  beforeEach(() => {
    globalThis.window = {
      devicePixelRatio: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    container = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() };
  });

  afterEach(() => {
    delete globalThis.window;
  });

  /** Dispatches a key event through the listener the game registered on window. */
  function key(type, code) {
    const call = window.addEventListener.mock.calls.findLast(([name]) => name === type);
    call[1]({ code, preventDefault: vi.fn() });
  }

  it('puts the character and the world in the scene', () => {
    const game = new Game(container);
    expect(container.appendChild).toHaveBeenCalledWith(game.renderer.domElement);
    expect(game.scene.getObjectByName('character')).toBe(game.character);
    expect(game.scene.getObjectByName('world')).toBe(game.world);
  });

  it('frames the character with the starting camera', () => {
    const game = new Game(container);
    const target = game.controls.target;
    expect(target.y).toBeGreaterThan(0.5);
    // The character stands at the origin; the orbit target should be on its
    // upper body and the starting camera within the allowed zoom range.
    expect(Math.hypot(target.x, target.z)).toBeLessThan(0.01);
    expect(game.camera.position.distanceTo(target)).toBeGreaterThan(game.controls.minDistance);
    expect(game.camera.position.distanceTo(target)).toBeLessThan(game.controls.maxDistance);
  });

  it('renders every frame once started', () => {
    const game = new Game(container);
    game.start();
    expect(game.renderer.setAnimationLoop).toHaveBeenCalled();
    game.renderer.loop();
    game.renderer.loop();
    expect(game.renderer.render).toHaveBeenCalledTimes(2);
    expect(game.renderer.render).toHaveBeenCalledWith(game.scene, game.camera);
  });

  it('updates the camera aspect on resize', () => {
    const game = new Game(container);
    container.clientWidth = 1000;
    container.clientHeight = 500;
    game.onResize();
    expect(game.camera.aspect).toBe(2);
    expect(game.renderer.setSize).toHaveBeenLastCalledWith(1000, 500);
  });

  it('listens for keyboard input', () => {
    new Game(container);
    const events = window.addEventListener.mock.calls.map(([name]) => name);
    expect(events).toEqual(expect.arrayContaining(['keydown', 'keyup', 'blur']));
  });

  it('walks the character away from the camera when W is held', () => {
    const game = new Game(container);
    const start = game.character.position.clone();
    const toCharacter = start.clone().sub(game.camera.position).setY(0).normalize();
    key('keydown', 'KeyW');
    for (let i = 0; i < 30; i++) game.update(1 / 60);
    const moved = game.character.position.clone().sub(start);
    expect(moved.length()).toBeCloseTo(MOVEMENT.walkSpeed * 0.5, 1);
    expect(moved.normalize().dot(toCharacter)).toBeCloseTo(1, 3);
  });

  it('keeps the camera following the character', () => {
    const game = new Game(container);
    const offset = game.camera.position.clone().sub(game.controls.target);
    key('keydown', 'ArrowLeft');
    for (let i = 0; i < 30; i++) game.update(1 / 60);
    expect(game.controls.target.x).toBeCloseTo(game.character.position.x, 6);
    expect(game.controls.target.z).toBeCloseTo(game.character.position.z, 6);
    expect(game.camera.position.clone().sub(game.controls.target).distanceTo(offset)).toBeLessThan(1e-6);
  });

  it('stops when the keys are released', () => {
    const game = new Game(container);
    key('keydown', 'KeyD');
    game.update(1 / 60);
    key('keyup', 'KeyD');
    game.update(1 / 60);
    const stopped = game.character.position.clone();
    game.update(1 / 60);
    expect(game.character.position.equals(stopped)).toBe(true);
  });

  it('jumps on Space and lowers the character while crouching', () => {
    const game = new Game(container);
    key('keydown', 'Space');
    game.update(1 / 60);
    expect(game.character.position.y).toBeGreaterThan(0);
    key('keyup', 'Space');
    for (let i = 0; i < 120; i++) game.update(1 / 60);
    expect(game.character.position.y).toBe(0);

    key('keydown', 'KeyC');
    for (let i = 0; i < 30; i++) game.update(1 / 60);
    expect(game.character.scale.y).toBeCloseTo(MOVEMENT.crouchHeight / CHARACTER_HEIGHT, 6);
    key('keyup', 'KeyC');
    for (let i = 0; i < 30; i++) game.update(1 / 60);
    expect(game.character.scale.y).toBeCloseTo(1, 6);
  });

  it('cleans up on dispose', () => {
    const game = new Game(container);
    game.start();
    game.dispose();
    expect(game.renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
    expect(window.removeEventListener).toHaveBeenCalledWith('resize', game.onResize);
    expect(window.removeEventListener).toHaveBeenCalledWith('keydown', game.input.handleKeyDown);
    expect(window.removeEventListener).toHaveBeenCalledWith('keyup', game.input.handleKeyUp);
    expect(game.renderer.dispose).toHaveBeenCalled();
  });
});
