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

  it('cleans up on dispose', () => {
    const game = new Game(container);
    game.start();
    game.dispose();
    expect(game.renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
    expect(window.removeEventListener).toHaveBeenCalledWith('resize', game.onResize);
    expect(game.renderer.dispose).toHaveBeenCalled();
  });
});
