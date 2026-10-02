import * as THREE from 'three';
import { ACTION_CONFIG } from './animation-library.js';

/**
 * Per-NPC animation state machine on top of three's AnimationMixer.
 *
 * The NPC's behaviour sets a posture (`stand`, `crouch`, `sit`, `carry`), its
 * ground speed and, for tasks, an action to play. Every frame the controller
 * works out which clip(s) should be playing and crossfades to them over
 * `blendDuration` seconds, so idle -> walk -> run -> idle, standing <->
 * crouching, walking <-> carrying and standing <-> sitting all blend instead
 * of snapping. A state can be layered: the lower body from one clip and the
 * upper body from another (sitting while eating, standing while carrying).
 *
 * Locomotion picks idle / walk / run / sprint from the speed with hysteresis
 * and scales the playback rate to match the speed, so feet do not slide.
 * While idle the controller now and then plays one of the NPC's idle
 * variants (looking around, folding arms, ...) at randomised intervals.
 */

const LOCOMOTION = ACTION_CONFIG.locomotion;

/**
 * Picks the gait for `speed`. A gait starts above its threshold and only
 * ends once the speed drops below `threshold * (1 - hysteresis)`, so an NPC
 * hovering around a threshold does not flicker between clips.
 */
export function gaitFor(speed, current, cfg = LOCOMOTION) {
  const order = ['idle', 'walk', 'run', 'sprint'];
  const start = { walk: cfg.walkThreshold, run: cfg.runThreshold, sprint: cfg.sprintThreshold };
  let index = Math.max(0, order.indexOf(current));
  while (index < 3 && speed > start[order[index + 1]]) index++;
  while (index > 0 && speed < start[order[index]] * (1 - cfg.hysteresis)) index--;
  return order[index];
}

export class AnimationController {
  /**
   * @param {THREE.Object3D} root the model whose bones the clips animate
   * @param {import('./animation-library.js').AnimationLibrary} library
   */
  constructor(root, library, {
    blendDuration = ACTION_CONFIG.blendDuration,
    locomotion = LOCOMOTION,
    idleVariants = library.idleVariants(),
    idleInterval = [2.5, 6],
    idleVariantLength = [3, 5],
    rng = Math.random,
    log = null,
  } = {}) {
    this.root = root;
    this.library = library;
    this.mixer = new THREE.AnimationMixer(root);
    this.blendDuration = blendDuration;
    this.locomotion = locomotion;
    this.idleVariants = idleVariants;
    this.idleInterval = idleInterval;
    this.idleVariantLength = idleVariantLength;
    this.rng = rng;
    this.log = log;

    this.posture = 'stand';
    this.speed = 0;
    this.gait = 'idle';
    this.task = null; // { action, loop, until, onDone, layer }
    this.transient = null; // posture change clips: sit_down / stand_up
    this.idleVariant = null; // { action, until }
    this.lastVariant = null;
    this.time = 0;
    this.stateTime = 0;
    this.idleTime = 0;
    this.nextVariantAt = this.randomBetween(idleInterval);

    this.state = null; // { key, layers: [{ action, clip, half }] }
    this.history = [];
    this.update(0);
  }

  randomBetween([min, max]) {
    return min + (max - min) * this.rng();
  }

  /** Ground speed in metres per second; drives the locomotion clip and its playback rate. */
  setSpeed(speed) {
    this.speed = Math.max(0, speed);
  }

  /** 'stand' | 'crouch' | 'sit' | 'carry'. Sitting down and standing up play their own clips first. */
  setPosture(posture) {
    if (posture === this.posture) return;
    if (posture === 'sit') this.transient = { action: 'sit_down' };
    else if (this.posture === 'sit') this.transient = { action: 'stand_up' };
    this.posture = posture;
  }

  /**
   * Plays a task action such as 'farm' or 'pick_up'. Looping actions run for
   * `duration` seconds (or until `stop()`); one-shots run once. `layer:
   * 'upper'` plays only the upper body over the current posture (eating
   * while seated). `onDone` is called when it ends.
   */
  play(action, { duration = null, onDone = null, layer = null } = {}) {
    const resolved = this.library.resolve(action);
    const clip = this.library.clipFor(action);
    const once = !resolved.loop;
    const length = once ? clip.duration : duration;
    this.task = { action, once, clamp: resolved.clamp, until: length == null ? null : this.time + length, onDone, layer };
    this.idleVariant = null;
  }

  /** Starts idle variant `action` now (for `seconds`), as if the idle timer had picked it. */
  playIdleVariant(action, seconds) {
    this.idleVariant = { action, until: this.time + seconds };
    this.lastVariant = action;
  }

  /** Ends the current task (clamped clips such as death stay until this is called). */
  stop() {
    const task = this.task;
    this.task = null;
    task?.onDone?.();
  }

  get busy() {
    return Boolean(this.task || this.transient);
  }

  /** The action name currently shown (for the debug overlay). */
  get currentAction() {
    return this.state?.key ?? null;
  }

  /** Works out the layers that should be playing now. */
  desiredState() {
    if (this.transient) return { key: this.transient.action, layers: [{ action: this.transient.action }] };
    if (this.task) {
      const { action, layer } = this.task;
      if (layer === 'upper') {
        const base = this.baseAction();
        return { key: `${base}+${action}`, layers: [{ action: base, half: 'lower' }, { action, half: 'upper' }] };
      }
      return { key: action, layers: [{ action }] };
    }
    const base = this.baseAction();
    if (this.posture === 'carry' && base === 'idle') {
      return { key: 'carry_idle', layers: [{ action: 'idle', half: 'lower' }, { action: 'carry', half: 'upper', hold: true }] };
    }
    const action = base === 'idle' && this.idleVariant ? this.idleVariant.action : base;
    return { key: action, layers: [{ action }] };
  }

  /** The posture / locomotion action ignoring tasks and idle variants. */
  baseAction() {
    const moving = this.gait !== 'idle';
    switch (this.posture) {
      case 'sit':
        return 'sit';
      case 'crouch':
        return moving ? 'crouch_walk' : 'crouch';
      case 'carry':
        return moving ? 'carry' : 'idle';
      default:
        return this.gait;
    }
  }

  /** Playback rate for a locomotion action at the current speed. */
  timeScaleFor(action) {
    const { speed } = this.library.resolve(action);
    if (!speed || this.speed <= 0) return 1;
    const { minTimeScale, maxTimeScale } = this.locomotion;
    return THREE.MathUtils.clamp(this.speed / speed, minTimeScale, maxTimeScale);
  }

  clipForLayer(layer) {
    return layer.half ? this.library.layerClip(layer.action, layer.half) : this.library.clipFor(layer.action);
  }

  /** Blend time between two states (run -> idle takes a little longer to settle). */
  blendFor(from, to) {
    if (!from) return 0;
    if ((from === 'run' || from === 'sprint') && to === 'idle') return this.blendDuration * 1.5;
    return this.blendDuration;
  }

  transition(next) {
    const previous = this.state;
    const duration = this.blendFor(previous?.key, next.key);
    const keep = new Set();
    const layers = next.layers.map((layer) => {
      const clip = this.clipForLayer(layer);
      const action = this.mixer.clipAction(clip);
      const resolved = this.library.resolve(layer.action);
      const loop = resolved.loop;
      const reused = previous?.layers.some((l) => l.clipAction === action);
      keep.add(action);
      if (!reused) {
        // Keep the stride in phase when switching between gaits.
        const phaseFrom = previous?.layers.find((l) => this.library.resolve(l.action).speed && !l.half);
        action.reset();
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        action.clampWhenFinished = !loop;
        if (phaseFrom && resolved.speed) action.time = (phaseFrom.clipAction.time / phaseFrom.clipAction.getClip().duration) * clip.duration;
        action.play();
        if (duration > 0) action.fadeIn(duration);
      }
      return { ...layer, clipAction: action };
    });
    for (const layer of previous?.layers ?? []) {
      if (!keep.has(layer.clipAction)) {
        if (duration > 0) layer.clipAction.fadeOut(duration);
        else layer.clipAction.stop();
      }
    }
    this.state = { key: next.key, layers };
    this.stateTime = 0;
    const entry = { from: previous?.key ?? null, to: next.key, duration, time: this.time };
    this.history.push(entry);
    if (this.history.length > 50) this.history.shift();
    this.log?.(`crossfade ${entry.from} -> ${entry.to} over ${duration.toFixed(2)} s`);
  }

  /** Advances timers, picks the state, crossfades if it changed and steps the mixer. */
  update(delta) {
    this.time += delta;
    this.stateTime += delta;
    this.gait = gaitFor(this.speed, this.gait, this.locomotion);

    // Posture-change clips end shortly before their last frame so the blend overlaps it.
    if (this.transient && this.state?.key === this.transient.action) {
      const clip = this.library.clipFor(this.transient.action);
      if (this.stateTime >= clip.duration - this.blendDuration) this.transient = null;
    }
    if (this.task && this.task.until !== null && !this.task.clamp && this.time >= this.task.until - (this.task.once ? this.blendDuration : 0)) {
      this.stop();
    }

    this.updateIdleVariant(delta);
    const next = this.desiredState();
    if (next.key !== this.state?.key) this.transition(next);

    for (const layer of this.state.layers) {
      layer.clipAction.setEffectiveTimeScale(layer.hold ? 0 : this.timeScaleFor(layer.action));
    }
    this.mixer.update(delta);
  }

  updateIdleVariant(delta) {
    const idle = !this.task && !this.transient && this.posture === 'stand' && this.gait === 'idle';
    if (!idle || this.idleVariants.length === 0) {
      this.idleVariant = null;
      this.idleTime = 0;
      return;
    }
    this.idleTime += delta;
    if (this.idleVariant && this.time >= this.idleVariant.until) {
      this.idleVariant = null;
      this.idleTime = 0;
      this.nextVariantAt = this.randomBetween(this.idleInterval);
    }
    if (!this.idleVariant && this.idleTime >= this.nextVariantAt) {
      const choices = this.idleVariants.filter((v) => v !== this.lastVariant);
      const action = (choices.length ? choices : this.idleVariants)[Math.floor(this.rng() * (choices.length || this.idleVariants.length))];
      this.idleVariant = { action, until: this.time + this.randomBetween(this.idleVariantLength) };
      this.lastVariant = action;
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}
