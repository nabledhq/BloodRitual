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

const THREE = await import('three');
const { Game, walkPathPoint } = await import('../src/game.js');
const { findNonPbrObjects } = await import('../src/materials.js');
const { collectInteractive } = await import('../src/interaction.js');
const { LAYOUT } = await import('../src/layout.js');

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

  it('configures shadows, tone mapping and sRGB output', () => {
    const game = new Game(container);
    expect(game.renderer.shadowMap.enabled).toBe(true);
    expect(game.renderer.shadowMap.type).toBe(THREE.PCFShadowMap);
    expect(game.renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(game.renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
  });

  it('uses no unlit or basic materials anywhere in the scene', () => {
    const game = new Game(container);
    let meshes = 0;
    game.scene.traverse((o) => o.isMesh && meshes++);
    expect(meshes).toBeGreaterThan(100);
    expect(findNonPbrObjects(game.scene).map((o) => o.name)).toEqual([]);
  });

  it('has characters that cast and receive shadows', () => {
    const game = new Game(container);
    for (const character of [game.character, ...game.npcs]) {
      const meshes = [];
      character.traverse((o) => o.isMesh && meshes.push(o));
      expect(meshes.some((m) => m.castShadow)).toBe(true);
      expect(meshes.every((m) => m.receiveShadow)).toBe(true);
    }
  });

  it('adds villagers: one idling by the fire and one walking the camp path', () => {
    const game = new Game(container);
    const [woman, man] = game.npcs;
    expect(game.scene.getObjectByName('npcWoman')).toBe(woman);
    expect(game.scene.getObjectByName('npcMan')).toBe(man);
    game.start();
    game.renderer.loop();
    const p0 = man.position.clone();
    game.timer.update = () => {};
    game.timer.getElapsed = () => 2;
    game.renderer.loop();
    expect(man.position.distanceTo(p0)).toBeGreaterThan(0.5);
    const path = LAYOUT.walkPath;
    const e = Math.hypot((man.position.x - path.x) / path.rx, (man.position.z - path.z) / path.rz);
    expect(e).toBeCloseTo(1, 5);
    expect(Math.abs(man.getObjectByName('leftLeg').rotation.x)).toBeGreaterThan(0);
  });

  it('walks the path facing the direction of travel', () => {
    const a = walkPathPoint(LAYOUT.walkPath, 1);
    const b = walkPathPoint(LAYOUT.walkPath, 1.01);
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    expect(Math.cos(heading - a.heading)).toBeGreaterThan(0.99);
  });

  it('highlights every interactive object and shows its prompt when targeted', () => {
    const promptElement = { textContent: '', classList: { toggle: vi.fn() } };
    const game = new Game(container, { promptElement });
    const targets = collectInteractive(game.scene);
    expect(targets.map((t) => t.name).sort()).toEqual(['canoe', 'chickee', 'firePit', 'mortar', 'npcMan', 'npcWoman'].sort());
    for (const target of targets) {
      const box = new THREE.Box3().setFromObject(target);
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();
      game.camera.position.copy(centre).add(new THREE.Vector3(0, 0.4, 1).normalize().multiplyScalar(size + 1.5));
      game.camera.lookAt(centre);
      game.camera.updateMatrixWorld(true);
      game.setPointer(0, 0);
      const original = new Map();
      target.traverse((o) => o.isMesh && original.set(o, o.material));
      expect(game.updateHover(), target.name).toBe(target);
      expect(promptElement.textContent).toContain(target.userData.interactive.label);
      expect(promptElement.classList.toggle).toHaveBeenLastCalledWith('visible', true);
      for (const [mesh, material] of original) {
        expect(mesh.material, mesh.name).not.toBe(material);
        expect(mesh.material.userData.isHighlight).toBe(true);
        const glow = mesh.material.emissive.r + mesh.material.emissive.g;
        const before = material.emissive.r * material.emissiveIntensity + material.emissive.g * material.emissiveIntensity;
        expect(glow).toBeGreaterThan(before);
      }
      game.setPointer(null);
      expect(game.updateHover()).toBeNull();
      for (const [mesh, material] of original) expect(mesh.material).toBe(material);
      expect(promptElement.textContent).toBe('');
    }
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
