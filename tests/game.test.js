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
const { Game } = await import('../src/game.js');
const { loadTestNpcAssets } = await import('./helpers/npc-assets.js');
const { ROLE_NAMES } = await import('../src/npc/roles.js');
const { DEBUG_KEYS } = await import('../src/input.js');
const { findNonPbrObjects } = await import('../src/materials.js');
const { collectInteractive } = await import('../src/interaction.js');
const { MOVEMENT } = await import('../src/config.js');
const { CHARACTER_HEIGHT } = await import('../src/character.js');
const { terrainHeight } = await import('../src/world.js');

/** Visible mesh names and colours of a body, to tell villagers apart. */
function collectLook(body) {
  const parts = new Set();
  body.traverse((o) => o.isMesh && o.visible && parts.add(`${o.name}:${[].concat(o.material).map((m) => m.color.getHexString()).join('/')}`));
  return parts;
}

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

  /** A game whose NPC models load from disk; await `game.npcsReady` before using them. */
  function makeGame(options = {}) {
    return new Game(container, { npcAssets: loadTestNpcAssets, ...options });
  }

  /** Dispatches a key event through every listener the game registered on window. */
  function key(type, code) {
    const calls = window.addEventListener.mock.calls.filter(([name]) => name === type);
    expect(calls.length).toBeGreaterThan(0);
    for (const [, listener] of calls) listener({ code, preventDefault: vi.fn() });
  }

  it('puts the character and the world in the scene', () => {
    const game = makeGame();
    expect(container.appendChild).toHaveBeenCalledWith(game.renderer.domElement);
    expect(game.scene.getObjectByName('character')).toBe(game.character);
    expect(game.scene.getObjectByName('world')).toBe(game.world);
  });

  it('frames the character with the starting camera', () => {
    const game = makeGame();
    const target = game.controls.target;
    expect(target.y).toBeGreaterThan(0.5);
    // The character stands at the origin; the orbit target should be on its
    // upper body and the starting camera within the allowed zoom range.
    expect(Math.hypot(target.x, target.z)).toBeLessThan(0.01);
    expect(game.camera.position.distanceTo(target)).toBeGreaterThan(game.controls.minDistance);
    expect(game.camera.position.distanceTo(target)).toBeLessThan(game.controls.maxDistance);
  });

  it('renders every frame once started', () => {
    const game = makeGame();
    game.start();
    expect(game.renderer.setAnimationLoop).toHaveBeenCalled();
    game.renderer.loop();
    game.renderer.loop();
    expect(game.renderer.render).toHaveBeenCalledTimes(2);
    expect(game.renderer.render).toHaveBeenCalledWith(game.scene, game.camera);
  });

  it('updates the camera aspect on resize', () => {
    const game = makeGame();
    container.clientWidth = 1000;
    container.clientHeight = 500;
    game.onResize();
    expect(game.camera.aspect).toBe(2);
    expect(game.renderer.setSize).toHaveBeenLastCalledWith(1000, 500);
  });

  it('configures shadows, tone mapping and sRGB output', () => {
    const game = makeGame();
    expect(game.renderer.shadowMap.enabled).toBe(true);
    expect(game.renderer.shadowMap.type).toBe(THREE.PCFShadowMap);
    expect(game.renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(game.renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
  });

  it('uses no unlit or basic materials anywhere in the scene', async () => {
    const game = makeGame();
    await game.npcsReady;
    let meshes = 0;
    game.scene.traverse((o) => o.isMesh && meshes++);
    expect(meshes).toBeGreaterThan(100);
    expect(findNonPbrObjects(game.scene).map((o) => o.name)).toEqual([]);
  });

  it('has characters that cast and receive shadows', async () => {
    const game = makeGame();
    await game.npcsReady;
    expect(game.npcs.length).toBeGreaterThan(0);
    for (const character of [game.character, ...game.npcs]) {
      const meshes = [];
      character.traverse((o) => o.isMesh && meshes.push(o));
      expect(meshes.some((m) => m.castShadow)).toBe(true);
      expect(meshes.every((m) => m.receiveShadow)).toBe(true);
    }
  });

  it('spawns a premade, skinned villager for every role, with no primitive-geometry NPCs left', async () => {
    const game = makeGame();
    const population = await game.npcsReady;
    expect(new Set(population.npcs.map((n) => n.roleName))).toEqual(new Set(ROLE_NAMES));
    for (const npc of game.npcs) {
      expect(game.scene.getObjectByName(npc.name)).toBe(npc);
      const meshes = [];
      population.npcs.find((n) => n.group === npc).body.traverse((o) => o.isMesh && meshes.push(o));
      expect(meshes.length, npc.name).toBeGreaterThan(0);
      // Every part of the body is a skinned glTF mesh driven by the shared skeleton.
      for (const mesh of meshes) expect(mesh.isSkinnedMesh, `${npc.name}/${mesh.name}`).toBe(true);
    }
    const models = new Set(population.npcs.map((n) => n.body.name));
    expect(models.size).toBeGreaterThanOrEqual(3);
  });

  it('animates the villagers over the terrain as the game runs', async () => {
    const game = makeGame();
    const population = await game.npcsReady;
    const start = population.npcs.map((n) => n.position.clone());
    const pelvis = population.npcs.map((n) => n.body.getObjectByName('pelvis').quaternion.clone());
    for (let i = 0; i < 120; i++) game.update(1 / 30);
    const moved = population.npcs.filter((n, i) => n.position.distanceTo(start[i]) > 0.5);
    expect(moved.length).toBeGreaterThan(0);
    population.npcs.forEach((npc, i) => {
      expect(npc.body.getObjectByName('pelvis').quaternion.angleTo(pelvis[i]), npc.name).toBeGreaterThan(0);
      expect(npc.position.y).toBeCloseTo(terrainHeight(npc.position.x, npc.position.z), 6);
    });
  });

  it('gives every villager a distinct appearance', async () => {
    const game = makeGame();
    const population = await game.npcsReady;
    const looks = population.npcs.map((n) => n.body.name + JSON.stringify([...collectLook(n.body)].sort()));
    expect(new Set(looks).size).toBe(population.npcs.length);
  });

  it('steps the selected villager through every action with the debug keys', async () => {
    const game = makeGame();
    const population = await game.npcsReady;
    key('keydown', DEBUG_KEYS.selectNpc);
    const npc = population.selected;
    expect(npc).toBe(population.npcs[0]);
    const actions = npc.controller.library.actionNames();
    const clips = [];
    for (let i = 0; i < actions.length; i++) {
      key('keydown', DEBUG_KEYS.nextAction);
      game.update(1 / 30);
      clips.push(npc.controller.state.layers[0].clipAction.getClip().name);
      expect(clips[i], actions[i]).toBe(npc.controller.library.resolve(actions[i]).clip);
    }
    expect(game.selectionMarker.visible).toBe(true);
    expect(game.debugOverlay.visible).toBe(true);
    key('keydown', DEBUG_KEYS.resumeNpc);
    expect(npc.debugAction).toBeNull();
  });

  it('runs the player with a run cycle while sprinting', () => {
    const game = makeGame();
    key('keydown', 'KeyW');
    key('keydown', 'ShiftLeft');
    for (let i = 0; i < 20; i++) game.update(1 / 60);
    expect(game.character.getObjectByName('leftElbow').rotation.x).toBeLessThan(-1);
  });

  it('highlights every interactive object and shows its prompt when targeted', async () => {
    const promptElement = { textContent: '', classList: { toggle: vi.fn() } };
    const game = makeGame({ promptElement });
    const population = await game.npcsReady;
    const targets = collectInteractive(game.scene);
    expect(targets.map((t) => t.name).sort()).toEqual(['canoe', 'chickee', 'firePit', 'mortar', ...population.npcs.map((n) => n.name)].sort());
    // Skinned villagers are posed by their skeletons, which the (fake) renderer would update.
    game.update(1 / 30);
    game.scene.updateMatrixWorld(true);
    game.scene.traverse((o) => o.isSkinnedMesh && o.skeleton.update());
    for (const target of targets) {
      const box = new THREE.Box3().setFromObject(target, true);
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

  it('listens for keyboard input', () => {
    makeGame();
    const events = window.addEventListener.mock.calls.map(([name]) => name);
    expect(events).toEqual(expect.arrayContaining(['keydown', 'keyup', 'blur']));
  });

  it('walks the character away from the camera when W is held', () => {
    const game = makeGame();
    const start = game.character.position.clone();
    const toCharacter = start.clone().sub(game.camera.position).setY(0).normalize();
    key('keydown', 'KeyW');
    for (let i = 0; i < 30; i++) game.update(1 / 60);
    const moved = game.character.position.clone().sub(start);
    expect(moved.length()).toBeCloseTo(MOVEMENT.walkSpeed * 0.5, 1);
    expect(moved.normalize().dot(toCharacter)).toBeCloseTo(1, 3);
  });

  it('keeps the camera following the character', () => {
    const game = makeGame();
    const offset = game.camera.position.clone().sub(game.controls.target);
    key('keydown', 'ArrowLeft');
    for (let i = 0; i < 30; i++) game.update(1 / 60);
    expect(game.controls.target.x).toBeCloseTo(game.character.position.x, 6);
    expect(game.controls.target.z).toBeCloseTo(game.character.position.z, 6);
    expect(game.camera.position.clone().sub(game.controls.target).distanceTo(offset)).toBeLessThan(1e-6);
  });

  it('stops when the keys are released', () => {
    const game = makeGame();
    key('keydown', 'KeyD');
    game.update(1 / 60);
    key('keyup', 'KeyD');
    game.update(1 / 60);
    const stopped = game.character.position.clone();
    game.update(1 / 60);
    expect(game.character.position.equals(stopped)).toBe(true);
  });

  it('jumps on Space and lowers the character while crouching', () => {
    const game = makeGame();
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

  it('keeps the character on the terrain outside the flat camp, with the camera following', () => {
    const game = makeGame();
    // Start on the hummocks well outside the camp clearing.
    const x = 18;
    const z = 14;
    game.movement.position.set(x, terrainHeight(x, z), z);
    const offset = game.camera.position.clone().sub(game.controls.target);
    game.controls.target.set(x, terrainHeight(x, z) + CHARACTER_HEIGHT * 0.6, z);
    game.camera.position.copy(game.controls.target).add(offset);
    const heights = new Set();
    key('keydown', 'KeyW');
    for (let i = 0; i < 90; i++) {
      game.update(1 / 60);
      const p = game.character.position;
      expect(p.y).toBeCloseTo(terrainHeight(p.x, p.z), 6);
      heights.add(p.y.toFixed(3));
    }
    // The ground really varied along the way, and the walk cycle is playing.
    expect(heights.size).toBeGreaterThan(5);
    expect(Math.abs(game.character.getObjectByName('leftLeg').rotation.x)).toBeGreaterThan(0);
    // The camera keeps the same offset from the target, which tracks the ground.
    expect(game.camera.position.clone().sub(game.controls.target).distanceTo(offset)).toBeLessThan(1e-6);
    const p = game.character.position;
    expect(game.controls.target.y).toBeCloseTo(terrainHeight(p.x, p.z) + CHARACTER_HEIGHT * 0.6, 6);
  });

  it('cleans up on dispose', () => {
    const game = makeGame();
    game.start();
    game.dispose();
    expect(game.renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
    expect(window.removeEventListener).toHaveBeenCalledWith('resize', game.onResize);
    expect(window.removeEventListener).toHaveBeenCalledWith('keydown', game.input.handleKeyDown);
    expect(window.removeEventListener).toHaveBeenCalledWith('keyup', game.input.handleKeyUp);
    expect(game.renderer.dispose).toHaveBeenCalled();
  });
});
