import { Animation, AnimationGroup, Quaternion, Vector3 } from '@babylonjs/core';
import { updateCharacterIdle, updateCharacterWalk } from '../character-animation.js';
import { MOVEMENT } from '../config.js';
import { smoothstep } from '../noise.js';

/**
 * Character animation through Babylon.js AnimationGroups with weight-based
 * blending. The procedural poses from src/character.js (idle, walk and run)
 * are baked into keyframed clips on the character's joints once, then all
 * three clips play together and their weights are blended over time, so
 * idle -> walk -> run transitions never snap.
 *
 * The selection and blending logic is pure (`locomotionWeights`,
 * `blendWeights`, `cycleRate`) and unit-tested in tests/animation.test.js.
 */

export const CLIPS = Object.freeze(['idle', 'walk', 'run']);
/** Keyframes per second in the baked clips. */
export const CLIP_FPS = 30;
/** Length of the baked idle loop (s) and of the cross-fade that closes it. */
export const IDLE_LOOP = 24;
const IDLE_SEAM = 3;
/** Frames in one stride cycle of the walk and run clips. */
export const CYCLE_FRAMES = 30;
/** How quickly blend weights approach their targets (1/s); ~0.25 s to settle. */
export const BLEND_RATE = 12;
/** Below this ground speed (m/s) the character is standing. */
export const STAND_SPEED = 0.05;
/** The run stride is this much longer than the walk stride. */
export const RUN_STRIDE = 1.45;

/** Which clip best describes the current motion. */
export function locomotionState({ speed, grounded }, config = MOVEMENT) {
  if (!grounded || speed < STAND_SPEED) return 'idle';
  return speed > config.walkSpeed * (1 + (config.sprintMultiplier - 1) / 2) ? 'run' : 'walk';
}

/**
 * Target clip weights for a ground speed: idle when standing or airborne,
 * walk at walking (or crouching) speed, blending into run as the speed
 * rises to a sprint. The weights always sum to 1.
 */
export function locomotionWeights({ speed, grounded }, config = MOVEMENT) {
  if (!grounded || speed < STAND_SPEED) return { idle: 1, walk: 0, run: 0 };
  const run = Math.min(1, Math.max(0, (speed - config.walkSpeed) / (config.walkSpeed * (config.sprintMultiplier - 1))));
  return { idle: 0, walk: 1 - run, run };
}

/**
 * Moves `current` weights towards `target` with exponential smoothing over
 * `dt` seconds. Because every weight moves by the same fraction, the sum
 * stays 1 throughout a transition.
 */
export function blendWeights(current, target, dt, rate = BLEND_RATE) {
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  const out = {};
  for (const clip of CLIPS) out[clip] = current[clip] + (target[clip] - current[clip]) * k;
  return out;
}

/** Stride cycles per second at `speed`, for a stride blended between walk and run. */
export function cycleRate(speed, strideLength, run) {
  return speed / (strideLength * (1 + (RUN_STRIDE - 1) * run));
}

// ---- Baking ---------------------------------------------------------------------

function rigNodes(character) {
  return [...new Set(Object.values(character.userData.rig))];
}

function snapshot(nodes) {
  return nodes.map((n) => ({
    position: new Vector3(n.position.x, n.position.y, n.position.z),
    rotation: (({ x, y, z, w }) => new Quaternion(x, y, z, w))(n.quaternion),
    scaling: new Vector3(n.scale.x, n.scale.y, n.scale.z),
  }));
}

function mix(a, b, t) {
  return a.map((pa, i) => ({
    position: Vector3.Lerp(pa.position, b[i].position, t),
    rotation: Quaternion.Slerp(pa.rotation, b[i].rotation, t),
    scaling: Vector3.Lerp(pa.scaling, b[i].scaling, t),
  }));
}

/** Samples `pose(frame)` into one AnimationGroup targeting the Babylon joints. */
function bake(scene, name, character, targets, frames, pose) {
  const nodes = rigNodes(character);
  const keys = nodes.map(() => ({ position: [], rotation: [], scaling: [] }));
  for (let f = 0; f <= frames; f++) {
    pose(f).forEach((p, i) => {
      keys[i].position.push({ frame: f, value: p.position });
      keys[i].rotation.push({ frame: f, value: p.rotation });
      keys[i].scaling.push({ frame: f, value: p.scaling });
    });
  }
  const group = new AnimationGroup(name, scene);
  nodes.forEach((node, i) => {
    const target = targets.get(node);
    target.rotationQuaternion ??= Quaternion.Identity();
    for (const [property, path, type] of [
      ['position', 'position', Animation.ANIMATIONTYPE_VECTOR3],
      ['rotation', 'rotationQuaternion', Animation.ANIMATIONTYPE_QUATERNION],
      ['scaling', 'scaling', Animation.ANIMATIONTYPE_VECTOR3],
    ]) {
      const animation = new Animation(`${name}-${node.name}-${path}`, path, CLIP_FPS, type, Animation.ANIMATIONLOOPMODE_CYCLE);
      animation.setKeys(keys[i][property]);
      group.addTargetedAnimation(animation, target);
    }
  });
  return group;
}

/**
 * Bakes the idle, walk and run clips of a procedural `character` (its
 * neutral description) onto the Babylon joints in `targets` (a Map from
 * neutral node to Babylon TransformNode). Returns `{ idle, walk, run }`.
 */
export function bakeLocomotionClips(scene, character, targets, name = character.name) {
  const nodes = rigNodes(character);
  const idleFrames = IDLE_LOOP * CLIP_FPS;
  const seamStart = (IDLE_LOOP - IDLE_SEAM) * CLIP_FPS;
  const idlePose = (t) => {
    updateCharacterIdle(character, t);
    return snapshot(nodes);
  };
  const idle = bake(scene, `${name}-idle`, character, targets, idleFrames, (f) => {
    const t = f / CLIP_FPS;
    const a = idlePose(t);
    // Cross-fade into the start of the loop so it repeats without a seam.
    return f <= seamStart ? a : mix(a, idlePose(t - IDLE_LOOP), smoothstep(seamStart, idleFrames, f));
  });
  const cycle = (run) => (f) => {
    const stride = character.userData.strideLength * (1 + (RUN_STRIDE - 1) * run);
    const bob = updateCharacterWalk(character, (f / CYCLE_FRAMES) * stride, 0, { run });
    character.userData.rig.body.position.y += bob;
    return snapshot(nodes);
  };
  const walk = bake(scene, `${name}-walk`, character, targets, CYCLE_FRAMES, cycle(0));
  const run = bake(scene, `${name}-run`, character, targets, CYCLE_FRAMES, cycle(1));
  updateCharacterIdle(character, 0);
  return { idle, walk, run };
}

/**
 * Plays a character's locomotion clips and blends their weights from the
 * character's speed every frame.
 */
export class AnimationController {
  constructor(clips, { strideLength, config = MOVEMENT, idleOffset = 0 } = {}) {
    this.clips = clips;
    this.strideLength = strideLength;
    this.config = config;
    this.weights = { idle: 1, walk: 0, run: 0 };
    this.target = { ...this.weights };
    for (const clip of CLIPS) {
      clips[clip].start(true, 1);
      clips[clip].weight = this.weights[clip];
    }
    if (idleOffset) clips.idle.goToFrame(idleOffset % (IDLE_LOOP * CLIP_FPS));
  }

  static forCharacter(scene, character, targets, options = {}) {
    const clips = bakeLocomotionClips(scene, character, targets);
    return new AnimationController(clips, { strideLength: character.userData.strideLength, ...options });
  }

  /** Blends towards the clips for `speed` (m/s) over `dt` seconds. */
  update(dt, { speed, grounded = true }) {
    this.target = locomotionWeights({ speed, grounded }, this.config);
    this.weights = blendWeights(this.weights, this.target, dt);
    for (const clip of CLIPS) this.clips[clip].weight = this.weights[clip];
    if (speed >= STAND_SPEED) {
      // Walk and run share one stride cycle, so they stay in step while blending.
      const ratio = (cycleRate(speed, this.strideLength, this.weights.run / (this.weights.walk + this.weights.run || 1)) * CYCLE_FRAMES) / CLIP_FPS;
      this.clips.walk.speedRatio = ratio;
      this.clips.run.speedRatio = ratio;
    }
    return this.weights;
  }

  dispose() {
    for (const clip of CLIPS) this.clips[clip].dispose();
  }
}
