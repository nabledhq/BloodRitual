import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NullEngine, PBRMaterial, Vector3 } from '@babylonjs/core';
import { Game } from '../src/engine/Game.js';
import { walkPathPoint } from '../src/villagers.js';
import { LAYOUT } from '../src/layout.js';
import { MOVEMENT } from '../src/config.js';
import { CHARACTER_HEIGHT } from '../src/character.js';
import { terrainHeight } from '../src/world.js';

// WebGL is not available under Node: the game runs on Babylon's NullEngine
// (real scene graph, cameras, animation and picking, no GPU) with the real
// Havok physics WebAssembly module.
const wasmBinary = readFileSync(fileURLToPath(new URL('../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm', import.meta.url)));
const STEP = 1 / 60;

function fakeKeyTarget() {
  const listeners = {};
  return {
    addEventListener: vi.fn((name, fn) => (listeners[name] ??= new Set()).add(fn)),
    removeEventListener: vi.fn((name, fn) => listeners[name]?.delete(fn)),
    key(type, code) {
      for (const fn of listeners[type] ?? []) fn({ type, code, repeat: false, preventDefault() {} });
    },
  };
}

async function createGame(options = {}) {
  const keys = fakeKeyTarget();
  const game = await Game.create(null, { engine: new NullEngine(), havokOptions: { wasmBinary }, keyTarget: keys, ...options });
  game.keys = keys;
  return game;
}

function run(game, seconds) {
  for (let t = 0; t < seconds; t += STEP) game.update(STEP);
}

function horizontal(v) {
  return new Vector3(v.x, 0, v.z);
}

describe('Game (Babylon.js)', () => {
  let game;
  beforeAll(async () => {
    game = await createGame();
  });
  afterAll(() => game.dispose());

  it('builds the world, the player and the villagers in a right-handed Babylon scene', () => {
    expect(game.scene.useRightHandedSystem).toBe(true);
    for (const name of ['ground', 'pond', 'chickee', 'firePit', 'canoe', 'sun', 'character']) {
      expect(game.scene.getNodeByName(name), name).toBeTruthy();
    }
    expect(game.npcs.npcs).toHaveLength(7);
    expect(game.scene.activeCamera).toBe(game.camera);
  });

  it('uses only physically based materials', () => {
    for (const material of game.scene.materials) {
      if (material === game.scene.defaultMaterial || material.name === 'skyBox') continue;
      expect(material, material.name).toBeInstanceOf(PBRMaterial);
    }
  });

  it('draws repeated vegetation with thin instances', () => {
    const instanced = game.scene.meshes.filter((m) => m.thinInstanceCount > 1);
    expect(instanced.length).toBeGreaterThan(10);
    const total = instanced.reduce((n, m) => n + m.thinInstanceCount, 0);
    expect(total).toBeGreaterThan(1000);
  });

  it('has a single, bounded shadow generator that characters and buildings cast into', () => {
    const generator = game.sceneManager.shadowGenerator;
    const light = generator.getLight();
    expect(game.scene.lights.filter((l) => l.getShadowGenerator()).length).toBe(1);
    expect(light.autoUpdateExtends).toBe(false);
    expect(generator.getShadowMap().getSize().width).toBe(2048);
    const casters = new Set(generator.getShadowMap().renderList.map((m) => m.name));
    expect(casters.has('thatchNorth')).toBe(true);
    expect(casters.has('garments-cotton')).toBe(true);
    expect(game.scene.getMeshByName('ground').receiveShadows).toBe(true);
  });

  it('frames the character with the starting camera and its limits', () => {
    const { camera } = game.cameraController;
    expect(camera.getClassName()).toBe('ArcRotateCamera');
    expect(camera.target.y).toBeCloseTo(terrainHeight(0, 0) + CHARACTER_HEIGHT * 0.6, 3);
    expect(game.cameraController.distance).toBeGreaterThan(2);
    expect(camera.upperBetaLimit).toBeLessThan(Math.PI / 2);
    expect(camera.upperRadiusLimit).toBe(15);
    // Arrow keys belong to the character, not the camera.
    expect(camera.inputs.attached.keyboard).toBeUndefined();
  });

  it('plays blended locomotion clips through AnimationGroups', () => {
    const groups = game.scene.animationGroups.map((g) => g.name);
    expect(groups).toEqual(expect.arrayContaining(['character-idle', 'character-walk', 'character-run', 'npcMan-walk']));
    expect(game.player.animation.clips.idle.isPlaying).toBe(true);
  });
});

describe('player movement and collision', () => {
  let game;
  beforeAll(async () => {
    game = await createGame();
  });
  afterAll(() => game.dispose());

  function reset(x = 0, z = 0) {
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'KeyC', 'Space', 'ArrowLeft']) game.keys.key('keyup', code);
    const y = terrainHeight(x, z);
    game.player.movement.position.set(x, y, z);
    game.player.movement.velocity.set(0, 0, 0);
    game.player.movement.grounded = true;
    game.physics.placeCharacter(game.player.controller, x, y, z);
    game.cameraController.follow({ x, y, z }, 0, { immediate: true });
    run(game, 0.5);
  }

  it('walks away from the camera when W is held, turning to face the way it goes', () => {
    // Open ground east of the camp, clear of villagers and props.
    reset(4, 5);
    game.camera.alpha = 0.3;
    const start = game.player.position.clone();
    const yaw = game.cameraController.yaw;
    const away = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    game.keys.key('keydown', 'KeyW');
    run(game, 0.5);
    const moved = horizontal(game.player.position).subtract(horizontal(start));
    expect(moved.length()).toBeCloseTo(MOVEMENT.walkSpeed * 0.5, 0);
    expect(Vector3.Dot(moved.normalize(), away)).toBeGreaterThan(0.99);
    const facing = game.player.movement.facing;
    expect(Math.cos(facing - Math.atan2(away.x, away.z))).toBeGreaterThan(0.99);
    // The camera's look-at point follows the character.
    run(game, 0.5);
    expect(Vector3.Distance(horizontal(game.cameraController.target), horizontal(game.player.position))).toBeLessThan(0.3);
    game.keys.key('keyup', 'KeyW');
    run(game, 0.1);
    const stopped = game.player.position.clone();
    run(game, 0.2);
    expect(game.player.position.distanceTo(stopped)).toBe(0);
  });

  it('blends from idle to walk to run and back over time', () => {
    reset(-8, 12);
    game.keys.key('keydown', 'KeyW');
    game.update(STEP);
    const first = { ...game.player.animation.weights };
    // No snap: one frame later the walk clip has only started to fade in.
    expect(first.walk).toBeGreaterThan(0);
    expect(first.walk).toBeLessThan(0.5);
    run(game, 0.6);
    expect(game.player.animation.weights.walk).toBeGreaterThan(0.95);
    game.keys.key('keydown', 'ShiftLeft');
    run(game, 0.6);
    expect(game.player.animation.weights.run).toBeGreaterThan(0.95);
    game.keys.key('keyup', 'ShiftLeft');
    game.keys.key('keyup', 'KeyW');
    run(game, 0.6);
    expect(game.player.animation.weights.idle).toBeGreaterThan(0.95);
  });

  it('jumps on Space and lowers the character while crouching', () => {
    reset(0, 0);
    game.keys.key('keydown', 'Space');
    game.update(STEP);
    game.keys.key('keyup', 'Space');
    run(game, 0.15);
    expect(game.player.root.position.y).toBeGreaterThan(terrainHeight(game.player.position.x, game.player.position.z) + 0.2);
    run(game, 1.5);
    expect(game.player.root.position.y).toBeCloseTo(terrainHeight(game.player.position.x, game.player.position.z), 6);
    game.keys.key('keydown', 'KeyC');
    run(game, 0.5);
    expect(game.player.root.scaling.y).toBeCloseTo(MOVEMENT.crouchHeight / CHARACTER_HEIGHT, 6);
    game.keys.key('keyup', 'KeyC');
    run(game, 0.5);
    expect(game.player.root.scaling.y).toBeCloseTo(1, 6);
  });

  it('follows the terrain outside the flat camp', () => {
    reset(18, 14);
    game.keys.key('keydown', 'KeyW');
    const heights = new Set();
    for (let i = 0; i < 90; i++) {
      game.update(STEP);
      const p = game.player.position;
      expect(p.y).toBeCloseTo(terrainHeight(p.x, p.z), 6);
      heights.add(p.y.toFixed(3));
    }
    expect(heights.size).toBeGreaterThan(5);
  });

  /** Walks from (x, z) towards a target for `seconds`; returns the closest approach. */
  function walkTowards(x, z, tx, tz, seconds) {
    reset(x, z);
    const yaw = Math.atan2(tx - x, tz - z);
    game.camera.alpha = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
    game.keys.key('keydown', 'KeyW');
    let closest = Infinity;
    for (let t = 0; t < seconds; t += STEP) {
      game.update(STEP);
      closest = Math.min(closest, Math.hypot(game.player.position.x - tx, game.player.position.z - tz));
    }
    game.keys.key('keyup', 'KeyW');
    return closest;
  }

  it('cannot walk through the chickee platform', () => {
    const { x, z } = LAYOUT.chickee;
    expect(walkTowards(x - 6, z + 2, x, z, 4)).toBeGreaterThan(1.2);
  });

  it('cannot walk through a tree trunk', () => {
    const tree = game.world.getObjectByName('cypress').userData.instances.find((p) => Math.hypot(p.x, p.z) < 30);
    expect(walkTowards(tree.x + 4, tree.z, tree.x, tree.z, 3)).toBeGreaterThan(0.3);
  });

  it('cannot walk through the canoe or a villager', () => {
    const { canoe } = LAYOUT;
    expect(walkTowards(canoe.x + 2.5, canoe.z - 2.5, canoe.x, canoe.z, 3)).toBeGreaterThan(0.3);
    const [x, z] = [3.6, -1.9]; // the elder resting by the chickee
    expect(walkTowards(x - 3, z + 1, x, z, 3)).toBeGreaterThan(0.4);
  });

  it('pulls the camera in rather than letting it pass through the chickee', () => {
    const { x, z } = LAYOUT.chickee;
    reset(x - 3.4, z + 2.4);
    // Look at the player from behind the chickee: the roof and platform are in the way.
    const toChickee = Math.atan2(z - game.player.position.z, x - game.player.position.x);
    game.camera.alpha = toChickee;
    game.camera.beta = 1.25;
    game.cameraController.distance = 10;
    for (let i = 0; i < 10; i++) {
      game.update(STEP);
      game.scene.render();
    }
    expect(game.camera.radius).toBeLessThan(6);
    // Clear view: the camera eases back out to the chosen distance.
    game.camera.alpha = toChickee + Math.PI;
    for (let i = 0; i < 120; i++) {
      game.update(STEP);
      game.scene.render();
    }
    expect(game.camera.radius).toBeGreaterThan(9);
  });
});

describe('villagers and pointing', () => {
  let game;
  const promptElement = { textContent: '', classList: { toggle: vi.fn() } };
  beforeAll(async () => {
    game = await createGame({ promptElement });
  });
  afterAll(() => game.dispose());

  it('has six idling villagers of every age and one walking the camp path', () => {
    const idle = game.npcs.npcs.filter((npc) => npc.behaviour === 'idle');
    expect(idle.map((npc) => npc.character.userData.variant).sort()).toEqual(['child', 'elderMan', 'elderWoman', 'man', 'teen', 'woman']);
    const man = game.npcs.npcs.find((npc) => npc.behaviour === 'walk');
    game.update(STEP);
    const p0 = man.root.position.clone();
    run(game, 2);
    expect(Vector3.Distance(man.root.position, p0)).toBeGreaterThan(0.5);
    const path = LAYOUT.walkPath;
    expect(Math.hypot((man.root.position.x - path.x) / path.rx, (man.root.position.z - path.z) / path.rz)).toBeCloseTo(1, 5);
    expect(man.animation.weights.walk).toBeGreaterThan(0.95);
    for (const npc of idle) {
      expect(npc.animation.weights.idle).toBe(1);
      expect(npc.root.position.y).toBeCloseTo(terrainHeight(npc.root.position.x, npc.root.position.z), 6);
    }
  });

  it('walks the path facing the direction of travel', () => {
    const a = walkPathPoint(LAYOUT.walkPath, 1);
    const b = walkPathPoint(LAYOUT.walkPath, 1.01);
    expect(Math.cos(Math.atan2(b.x - a.x, b.z - a.z) - a.heading)).toBeGreaterThan(0.99);
  });

  it('highlights every interactive object and shows its prompt when targeted', () => {
    const names = game.interaction.interactive.map((o) => o.name).sort();
    expect(names).toEqual(['canoe', 'chickee', 'firePit', 'mortar', 'npcMan', 'npcWoman', 'npcElderWoman', 'npcElderMan', 'npcTeen', 'npcChild', 'npcHunter'].sort());
    for (const target of game.interaction.interactive) {
      expect(game.interaction.setTarget(target)).toBe(true);
      expect(promptElement.textContent).toContain(target.userData.interactive.label);
      expect(promptElement.classList.toggle).toHaveBeenLastCalledWith('visible', true);
      const meshes = game.interaction.meshes.get(target);
      expect(meshes.length, target.name).toBeGreaterThan(0);
      for (const mesh of meshes) expect(mesh.renderOverlay).toBe(true);
      game.interaction.setTarget(null);
      for (const mesh of meshes) expect(mesh.renderOverlay).toBe(false);
      expect(promptElement.textContent).toBe('');
    }
  });

  it('picks the object under the pointer', () => {
    const chickee = game.interaction.interactive.find((o) => o.name === 'chickee');
    const node = game.sceneManager.nodes.get(chickee.getObjectByName('thatchNorth'));
    const centre = node.getBoundingInfo().boundingSphere.centerWorld;
    const camera = game.camera;
    camera.target.copyFrom(centre);
    camera.radius = 9;
    camera.alpha = Math.PI / 2 + 0.4;
    camera.beta = 1.1;
    game.scene.render();
    const engine = game.engine;
    const picked = game.interaction.pick(engine.getRenderWidth() / 2, engine.getRenderHeight() / 2);
    expect(picked).toBe(chickee);
  });
});

describe('dispose', () => {
  it('stops the loop and releases input listeners', async () => {
    const game = await createGame();
    game.start();
    game.dispose();
    expect(game.keys.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(game.scene.isDisposed).toBe(true);
  });
});
