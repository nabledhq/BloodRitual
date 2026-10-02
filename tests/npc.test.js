import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { loadTestNpcAssets, loadGltfFromDisk } from './helpers/npc-assets.js';
import { NPC_ASSET_URLS, createNpcBody } from '../src/npc/assets.js';
import { AnimationLibrary, REQUIRED_ACTIONS, IDLE_VARIANTS, ACTION_CONFIG, resolveActions, unresolvedActions } from '../src/npc/animation-library.js';
import { AnimationController, gaitFor } from '../src/npc/animation-controller.js';
import { captureRig, retargetClip } from '../src/npc/retarget.js';
import { ROLES, ROLE_NAMES, POPULATION, ROLE_CONFIG, validateRoles } from '../src/npc/roles.js';
import { NpcPopulation } from '../src/npc/population.js';
import { createRng } from '../src/rng.js';
import { findNonPbrObjects } from '../src/materials.js';

const SPEC_ACTIONS = [
  'walk', 'run', 'sprint', 'crouch', 'sit', 'stand_up', 'carry', 'pick_up', 'open_door', 'ride', 'talk', 'point', 'wave',
  'eat', 'drink', 'tool_work', 'farm', 'fish', 'chop', 'fight', 'cover', 'reload', 'injured_walk', 'fall', 'death',
];

let assets;
beforeAll(async () => {
  assets = await loadTestNpcAssets();
});

function controllerFor(model = 'man', options = {}) {
  const body = createNpcBody(assets, { model });
  return new AnimationController(body, assets.models.get(model).library, { rng: createRng(5), ...options });
}

/** Steps a controller for `seconds` in `step`-second frames. */
function run(controller, seconds, step = 1 / 30) {
  for (let t = 0; t < seconds - 1e-9; t += step) controller.update(step);
}

describe('animation library', () => {
  it('requires exactly the 25 actions from the spec', () => {
    expect([...REQUIRED_ACTIONS].sort()).toEqual([...SPEC_ACTIONS].sort());
  });

  it('resolves every action name to a clip in the shipped animation file (no unresolved names)', async () => {
    const gltf = await loadGltfFromDisk(NPC_ASSET_URLS.animations);
    const resolved = resolveActions(gltf.animations.map((c) => c.name));
    expect(unresolvedActions(resolved)).toEqual([]);
    for (const action of [...SPEC_ACTIONS, ...IDLE_VARIANTS]) {
      const r = resolved.get(action);
      expect(r, action).toBeDefined();
      expect(gltf.animations.some((c) => c.name === r.clip), `${action} -> ${r.clip}`).toBe(true);
    }
  });

  it('falls back along the configured chain and ends at idle when nothing matches', () => {
    const resolved = resolveActions(['Idle_Loop', 'Interact']);
    expect(resolved.get('point')).toMatchObject({ clip: 'Interact', fallback: true, via: ['point', 'interact'] });
    expect(resolved.get('farm')).toMatchObject({ clip: 'Idle_Loop', fallback: true });
    expect(resolved.get('idle')).toMatchObject({ clip: 'Idle_Loop', fallback: false });
    expect(unresolvedActions(resolved)).toEqual([]);
    // A fallback loop cannot hang the resolver.
    const config = { ...ACTION_CONFIG, defaultFallback: 'a', required: [], idleVariants: [], actions: { a: { clips: [], fallback: 'b' }, b: { clips: [], fallback: 'a' } } };
    expect(unresolvedActions(resolveActions([], config))).toEqual(['a', 'b']);
  });

  it('prefers a dedicated clip over a fallback when one is added', () => {
    const resolved = resolveActions(['Idle_Loop', 'Interact', 'Wave']);
    expect(resolved.get('wave')).toMatchObject({ clip: 'Wave', fallback: false });
  });

  it('offers idle variants that are all different clips', () => {
    const library = assets.models.get('man').library;
    const variants = library.idleVariants();
    expect(variants.length).toBeGreaterThanOrEqual(4);
    const clips = variants.map((v) => library.resolve(v).clip);
    expect(new Set(clips).size).toBe(clips.length);
    expect(clips).not.toContain(library.resolve('idle').clip);
  });
});

describe('NPC models', () => {
  it('ships at least 3 distinct rigged models with skinned meshes on one shared skeleton each', () => {
    expect(assets.models.size).toBeGreaterThanOrEqual(3);
    for (const [name, model] of assets.models) {
      const skinned = [];
      model.template.traverse((o) => o.isSkinnedMesh && skinned.push(o));
      expect(skinned.length, name).toBeGreaterThanOrEqual(5);
      const rootBones = new Set(skinned.map((m) => m.skeleton.bones[0]));
      expect(rootBones.size, `${name} parts share one skeleton`).toBe(1);
      for (const mesh of skinned) expect(mesh.skeleton.bones).toEqual(skinned[0].skeleton.bones);
    }
    // Distinct geometry, not just recolours.
    const counts = [...assets.models.values()].map((m) => {
      let vertices = 0;
      m.template.traverse((o) => o.isMesh && (vertices += o.geometry.attributes.position.count));
      return vertices;
    });
    expect(new Set(counts).size).toBe(counts.length);
  });

  it('clones independent bodies with PBR materials, shadows and the requested hair', () => {
    const a = createNpcBody(assets, { model: 'man', hair: 'hair_parted', beard: true, tint: { cloth: '#ff0000' } });
    const b = createNpcBody(assets, { model: 'man', hair: 'hair_buzzed' });
    expect(a.getObjectByName('pelvis')).not.toBe(b.getObjectByName('pelvis'));
    expect(a.getObjectByName('hair_parted').visible).toBe(true);
    expect(a.getObjectByName('hair_buzzed').visible).toBe(false);
    expect(a.getObjectByName('beard').visible).toBe(true);
    expect(b.getObjectByName('beard').visible).toBe(false);
    expect(a.getObjectByName('body').material.color.getHexString()).toBe('ff0000');
    expect(b.getObjectByName('body').material.color.getHexString()).toBe('ffffff');
    expect(findNonPbrObjects(a)).toEqual([]);
    a.traverse((o) => o.isMesh && expect(o.castShadow && o.receiveShadow).toBe(true));
    // Culling / picking bounds cover the whole body before the skeleton is first posed.
    a.traverse((o) => o.isSkinnedMesh && expect(o.boundingSphere.radius).toBeGreaterThan(1));
  });

  it('stays within the asset size budget', () => {
    const dir = fileURLToPath(new URL('../public/models/npc/', import.meta.url));
    const total = ['npc-characters.glb', 'npc-animations.glb'].reduce((sum, f) => sum + statSync(dir + f).size, 0);
    expect(total).toBeLessThan(50e6);
  });

  it('credits every shipped model file with a licence and source', () => {
    const credits = readFileSync(fileURLToPath(new URL('../ASSETS_LICENSES.md', import.meta.url)), 'utf8');
    for (const file of ['npc-characters.glb', 'npc-animations.glb']) {
      const row = credits.split('\n').find((line) => line.includes(file));
      expect(row, file).toBeDefined();
      expect(row).toMatch(/CC0/);
      expect(row).toMatch(/https:\/\//);
    }
  });
});

describe('retargeting', () => {
  it('maps the source rest pose onto the target rest pose', () => {
    const source = captureRig(new THREE.Group().add(makeChain([0, 0.3, 0])));
    const target = captureRig(new THREE.Group().add(makeChain([0.2, 0.1, 0])));
    const rest = new THREE.AnimationClip('rest', 1, source.bones.map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, [0, 1], [...b.quaternion.toArray(), ...b.quaternion.toArray()])));
    const out = retargetClip(rest, source, target);
    for (const bone of target.bones) {
      const track = out.tracks.find((t) => t.name === `${bone.name}.quaternion`);
      const q = new THREE.Quaternion().fromArray(track.values, 0);
      expect(q.angleTo(bone.quaternion), bone.name).toBeLessThan(2e-3);
    }
  });

  it('gives each target bone the same world-space rotation from rest as the source bone', () => {
    const source = captureRig(new THREE.Group().add(makeChain([0, 0.3, 0])));
    const target = captureRig(new THREE.Group().add(makeChain([0.25, -0.2, 0.1])));
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.7);
    const bent = source.bones.map((b) => (b.name === 'spine' ? b.quaternion.clone().premultiply(turn) : b.quaternion));
    const clip = new THREE.AnimationClip('bend', 1, source.bones.map((b, i) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, [0, 1], [...bent[i].toArray(), ...bent[i].toArray()])));
    const out = retargetClip(clip, source, target);
    const local = (name) => new THREE.Quaternion().fromArray(out.tracks.find((t) => t.name === `${name}.quaternion`).values, 0);
    const world = local('root').multiply(local('spine'));
    const restWorld = target.byName.get('spine').world;
    const delta = world.clone().multiply(restWorld.clone().invert());
    const parentWorld = local('root');
    const expected = parentWorld.clone().multiply(turn).multiply(parentWorld.clone().invert());
    expect(delta.angleTo(expected)).toBeLessThan(2e-3);
  });

  it('keeps feet near the ground when walking on every model', () => {
    for (const model of assets.models.keys()) {
      const body = createNpcBody(assets, { model });
      const mixer = new THREE.AnimationMixer(body);
      mixer.clipAction(assets.models.get(model).library.clipFor('walk')).play();
      let lowest = Infinity;
      for (let i = 0; i < 40; i++) {
        mixer.update(1 / 30);
        body.updateMatrixWorld(true);
        for (const foot of ['foot_l', 'foot_r']) lowest = Math.min(lowest, new THREE.Vector3().setFromMatrixPosition(body.getObjectByName(foot).matrixWorld).y);
      }
      // The ankle joint sits a few centimetres above the sole.
      expect(lowest, model).toBeGreaterThan(0.02);
      expect(lowest, model).toBeLessThan(0.15);
    }
  });
});

/** A three-bone chain root > spine > head with the given spine offset. */
function makeChain(spineOffset) {
  const root = new THREE.Bone();
  root.name = 'root';
  root.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const spine = new THREE.Bone();
  spine.name = 'spine';
  spine.position.fromArray(spineOffset);
  spine.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), spineOffset[0]);
  const head = new THREE.Bone();
  head.name = 'head';
  head.position.set(0, 0.2, 0);
  head.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spineOffset[1]);
  root.add(spine);
  spine.add(head);
  return root;
}

describe('AnimationController', () => {
  it('crossfades (never snaps) between every required pair of states', () => {
    const c = controllerFor('man', { idleVariants: [] });
    const blends = [];
    const step = (seconds) => run(c, seconds);
    const expectBlend = (from, to) => {
      const entry = c.history[c.history.length - 1];
      expect(entry, `${from} -> ${to}`).toMatchObject({ from, to });
      expect(entry.duration, `${from} -> ${to}`).toBeGreaterThan(0);
      blends.push(`${from}>${to}`);
    };
    const midBlendWeights = () => {
      c.update(c.blendDuration / 2);
      return c.mixer._actions.filter((a) => a.isRunning() && a.getEffectiveWeight() > 0).map((a) => a.getEffectiveWeight());
    };

    step(1);
    c.setSpeed(1.2);
    c.update(1 / 30);
    expectBlend('idle', 'walk');
    const weights = midBlendWeights();
    // Half-way through the blend both clips contribute.
    expect(weights.length).toBe(2);
    for (const w of weights) expect(w).toBeGreaterThan(0.1);
    step(1);
    c.setSpeed(3);
    c.update(1 / 30);
    expectBlend('walk', 'run');
    step(1);
    c.setSpeed(1.2);
    c.update(1 / 30);
    expectBlend('run', 'walk');
    step(1);
    c.setSpeed(3);
    step(1);
    c.setSpeed(0);
    c.update(1 / 30);
    expectBlend('run', 'idle');
    step(1);
    c.setSpeed(1.2);
    step(1);
    c.setSpeed(0);
    c.update(1 / 30);
    expectBlend('walk', 'idle');
    step(1);
    c.setPosture('crouch');
    c.update(1 / 30);
    expectBlend('idle', 'crouch');
    step(1);
    c.setPosture('stand');
    c.update(1 / 30);
    expectBlend('crouch', 'idle');
    step(1);
    c.setSpeed(1.2);
    step(1);
    c.setPosture('carry');
    c.update(1 / 30);
    expectBlend('walk', 'carry');
    step(1);
    c.setPosture('stand');
    c.update(1 / 30);
    expectBlend('carry', 'walk');
    c.setSpeed(0);
    step(1);
    c.setPosture('sit');
    c.update(1 / 30);
    expectBlend('idle', 'sit_down');
    step(3);
    expect(c.history.some((h) => h.from === 'sit_down' && h.to === 'sit' && h.duration > 0)).toBe(true);
    c.setPosture('stand');
    c.update(1 / 30);
    expectBlend('sit', 'stand_up');
    step(3);
    expect(c.currentAction).toBe('idle');
    expect(c.history.every((h) => h.from === null || h.duration > 0)).toBe(true);
    expect(blends).toHaveLength(11);
  });

  it('uses a configurable blend duration defaulting to 0.2-0.4 s', () => {
    expect(ACTION_CONFIG.blendDuration).toBeGreaterThanOrEqual(0.2);
    expect(ACTION_CONFIG.blendDuration).toBeLessThanOrEqual(0.4);
    const c = controllerFor('man', { blendDuration: 0.25, idleVariants: [] });
    c.setSpeed(1);
    c.update(0.1);
    expect(c.history.at(-1)).toMatchObject({ from: 'idle', to: 'walk', duration: 0.25 });
  });

  it('logs every crossfade with its duration when given a logger', () => {
    const lines = [];
    const c = controllerFor('man', { idleVariants: [], log: (l) => lines.push(l) });
    c.setSpeed(1);
    c.update(0.1);
    expect(lines.at(-1)).toMatch(/crossfade idle -> walk over 0\.30 s/);
  });

  it('switches walk -> run -> sprint on speed thresholds, with hysteresis', () => {
    const cfg = ACTION_CONFIG.locomotion;
    expect(gaitFor(0, 'idle')).toBe('idle');
    expect(gaitFor(cfg.walkThreshold + 0.01, 'idle')).toBe('walk');
    expect(gaitFor(cfg.runThreshold - 0.01, 'walk')).toBe('walk');
    expect(gaitFor(cfg.runThreshold + 0.01, 'walk')).toBe('run');
    // Just below the threshold the NPC keeps running (hysteresis) ...
    expect(gaitFor(cfg.runThreshold - 0.05, 'run')).toBe('run');
    // ... until it is clearly slower.
    expect(gaitFor(cfg.runThreshold * (1 - cfg.hysteresis) - 0.01, 'run')).toBe('walk');
    expect(gaitFor(cfg.sprintThreshold + 0.1, 'walk')).toBe('sprint');
    expect(gaitFor(0, 'sprint')).toBe('idle');
  });

  it('scales locomotion playback with speed', () => {
    const c = controllerFor('man', { idleVariants: [] });
    c.setSpeed(0.8);
    c.update(0.1);
    const slow = c.state.layers[0].clipAction.getEffectiveTimeScale();
    c.setSpeed(1.4);
    c.update(0.1);
    const fast = c.state.layers[0].clipAction.getEffectiveTimeScale();
    expect(c.currentAction).toBe('walk');
    expect(fast).toBeGreaterThan(slow);
    expect(fast).toBeCloseTo(1.4 / ACTION_CONFIG.actions.walk.speed, 5);
  });

  it('plays at least 2 different idle variants within 30 s of standing idle', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const c = controllerFor('woman', { rng: createRng(seed) });
      const seen = new Set();
      for (let t = 0; t < 30; t += 1 / 30) {
        c.update(1 / 30);
        if (c.currentAction !== 'idle') seen.add(c.library.resolve(c.currentAction).clip);
      }
      expect(seen.size, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(c.history.filter((h) => h.to !== 'idle').every((h) => h.duration > 0)).toBe(true);
    }
  });

  it('layers an upper-body action over sitting', () => {
    const c = controllerFor('man', { idleVariants: [] });
    c.setPosture('sit');
    run(c, 2);
    c.play('eat', { duration: 3, layer: 'upper' });
    c.update(0.1);
    expect(c.currentAction).toBe('sit+eat');
    const [lower, upper] = c.state.layers.map((l) => l.clipAction.getClip());
    expect(lower.tracks.some((t) => t.name.startsWith('thigh_l'))).toBe(true);
    expect(lower.tracks.some((t) => t.name.startsWith('upperarm_l'))).toBe(false);
    expect(upper.tracks.some((t) => t.name.startsWith('upperarm_l'))).toBe(true);
    expect(upper.tracks.some((t) => t.name.startsWith('thigh_l'))).toBe(false);
    run(c, 3.5);
    expect(c.currentAction).toBe('sit');
  });
});

describe('roles', () => {
  it('defines the six roles in config with different idle sets, speeds and work clips', () => {
    expect([...ROLE_NAMES].sort()).toEqual(['civilian', 'farmer', 'hunter', 'laborer', 'lawman', 'trader']);
    expect(validateRoles()).toEqual([]);
    const field = (key) => ROLE_NAMES.map((r) => JSON.stringify(ROLES[r][key]));
    expect(new Set(field('idleSet')).size).toBe(6);
    expect(new Set(field('walkSpeed')).size).toBeGreaterThanOrEqual(5);
    expect(new Set(field('workClip')).size).toBeGreaterThanOrEqual(5);
    const library = assets.models.get('man').library;
    for (const role of ROLE_NAMES) {
      expect(library.resolve(ROLES[role].workClip).clip, role).toBeTruthy();
      expect(library.idleVariants(ROLES[role].idleSet).length, role).toBeGreaterThanOrEqual(2);
      expect(ROLES[role].tasks.length, role).toBeGreaterThanOrEqual(4);
    }
  });

  it('follows the farmer loop from the spec', () => {
    const steps = ROLES.farmer.tasks.map((t) => (t.do === 'work' ? ROLES.farmer.workClip : t.do === 'play' ? t.action : t.posture ? `${t.do}:${t.posture}` : t.do));
    expect(steps).toEqual(['walk', 'farm', 'idle', 'pick_up', 'walk:carry', 'pick_up', 'walk', 'sit']);
    expect(ROLES.farmer.tasks.at(-1).action).toBe('eat');
  });

  it('reports bad config', () => {
    const bad = structuredClone(ROLE_CONFIG);
    bad.roles.farmer.tasks.push({ do: 'walk', to: 'nowhere' }, { do: 'dance' });
    delete bad.roles.trader.workClip;
    const problems = validateRoles(bad);
    expect(problems.join('\n')).toMatch(/unknown place "nowhere"/);
    expect(problems.join('\n')).toMatch(/unknown task type "dance"/);
    expect(problems.join('\n')).toMatch(/trader: missing workClip/);
  });
});

describe('NpcPopulation', () => {
  const flat = () => 0;

  it('spawns at least one NPC of every role', () => {
    const population = new NpcPopulation(assets, { groundAt: flat });
    expect(new Set(population.npcs.map((n) => n.roleName))).toEqual(new Set(ROLE_NAMES));
    expect(population.npcs).toHaveLength(POPULATION.length);
    // Every villager looks different.
    const looks = population.npcs.map((n) => {
      const parts = [];
      n.body.traverse((o) => o.isMesh && o.visible && parts.push(`${o.name}:${[].concat(o.material).map((m) => m.color.getHexString()).join('/')}`));
      return `${n.body.name}|${parts.sort().join(',')}`;
    });
    expect(new Set(looks).size).toBe(looks.length);
  });

  it('runs every role through at least one full cycle of its task loop', () => {
    const population = new NpcPopulation(assets, { groundAt: flat });
    const seen = new Map(population.npcs.map((n) => [n.name, new Set()]));
    const step = 1 / 20;
    for (let t = 0; t < 200 && population.npcs.some((n) => n.cycles < 1); t += step) {
      population.update(step);
      for (const n of population.npcs) seen.get(n.name).add(n.controller.currentAction);
    }
    for (const npc of population.npcs) {
      expect(npc.cycles, npc.name).toBeGreaterThanOrEqual(1);
      expect(seen.get(npc.name).has(npc.role.workClip) || [...seen.get(npc.name)].some((a) => a.includes(npc.role.workClip)), `${npc.name} played ${npc.role.workClip}`).toBe(true);
    }
    const all = new Set(population.npcs.flatMap((n) => [...seen.get(n.name)]));
    for (const state of ['walk', 'run', 'carry', 'sit_down', 'stand_up', 'crouch', 'farm', 'chop', 'tool_work']) expect(all.has(state), state).toBe(true);
  });

  it('lets nearby idle NPCs face each other and talk', () => {
    const population = new NpcPopulation(assets, { groundAt: flat, seed: 3 });
    const [a, b] = population.npcs;
    for (const npc of [a, b]) {
      npc.startTask(npc.role.tasks.findIndex((t) => t.do === 'idle'));
      npc.task.def = { ...npc.task.def, seconds: 30 };
    }
    a.position.set(0, 0, 0);
    b.position.set(1.5, 0, 0);
    for (let t = 0; t < 10 && !a.chat; t += 0.05) {
      a.update(0.05);
      b.update(0.05);
      population.pairUpTalkers(0.05);
    }
    expect(a.chat?.partner).toBe(b);
    expect(b.chat?.partner).toBe(a);
    for (let i = 0; i < 30; i++) {
      a.update(0.05);
      b.update(0.05);
    }
    expect(a.controller.currentAction).toBe('talk');
    expect(Math.abs(a.heading - Math.PI / 2)).toBeLessThan(0.05);
    expect(Math.abs(Math.abs(b.heading) - Math.PI / 2)).toBeLessThan(0.05);
  });

  it('debug-cycles the selected NPC through every registered action', () => {
    const population = new NpcPopulation(assets, { groundAt: flat });
    const npc = population.selectNext();
    const actions = npc.controller.library.actionNames();
    expect(actions.slice(0, 25)).toEqual(REQUIRED_ACTIONS);
    const played = [];
    for (let i = 0; i < actions.length; i++) {
      const resolved = population.playNextAction();
      npc.update(0.05);
      const clip = npc.controller.state.layers[0].clipAction.getClip().name;
      expect(clip, resolved.action).toBe(resolved.clip);
      played.push(resolved.action);
    }
    expect(played).toEqual(actions);
    // The schedule is paused while debugging, and resumes afterwards.
    const before = npc.position.clone();
    for (let i = 0; i < 20; i++) population.update(0.05);
    expect(npc.position.distanceTo(before)).toBe(0);
    population.resumeSelected();
    expect(npc.debugAction).toBeNull();
    expect(population.selectNext()).toBe(population.npcs[1]);
  });
});

describe('AnimationLibrary', () => {
  it('works without a rig (no layering)', () => {
    const clip = new THREE.AnimationClip('Idle_Loop', 1, []);
    const library = new AnimationLibrary([clip]);
    expect(library.clipFor('death')).toBe(clip);
    expect(library.layerClip('idle', 'upper')).toBe(clip);
  });
});
