import ACTION_CONFIG from './actions.json';
import { boneSubtree, maskClip } from './retarget.js';

/**
 * The shared animation library: maps logical action names ("walk", "farm",
 * "death", ...) to animation clips. The mapping lives in `actions.json`:
 * every action lists the clip names that genuinely depict it, and a
 * `fallback` action to use when none of them is in the library. Following
 * fallbacks always ends at a real clip (ultimately `defaultFallback`, idle),
 * so every action resolves; `resolved.fallback` says when a stand-in is used.
 */

export { ACTION_CONFIG };

/** Bone at the base of the upper-body layer. */
export const UPPER_BODY_ROOT = 'spine_02';

/** The 25 actions every NPC must be able to play. */
export const REQUIRED_ACTIONS = Object.freeze([...ACTION_CONFIG.required]);

/** Idle variants NPCs pick from while standing around. */
export const IDLE_VARIANTS = Object.freeze([...ACTION_CONFIG.idleVariants]);

/**
 * Resolves every action in `config` against the available clip names.
 * Returns a Map of action name to
 * `{ action, clip, via, fallback, loop, clamp, speed }` where `clip` is the
 * clip name (or null if nothing resolves), `via` the chain of actions
 * followed and `fallback` true when the clip is a stand-in.
 */
export function resolveActions(clipNames, config = ACTION_CONFIG) {
  const available = new Set(clipNames);
  const resolved = new Map();
  const resolve = (name, chain = []) => {
    if (chain.includes(name)) return { clip: null, via: [...chain, name], entry: null };
    const entry = config.actions[name];
    const via = [...chain, name];
    if (entry) {
      const clip = entry.clips.find((c) => available.has(c));
      if (clip) return { clip, via, entry };
    }
    const next = entry?.fallback ?? (name === config.defaultFallback ? null : config.defaultFallback);
    return next ? resolve(next, via) : { clip: null, via, entry: null };
  };
  const names = new Set([...Object.keys(config.actions), ...config.required, ...config.idleVariants]);
  for (const action of names) {
    const { clip, via, entry } = resolve(action);
    resolved.set(action, {
      action,
      clip,
      via,
      fallback: via.length > 1,
      loop: entry?.loop ?? true,
      clamp: entry?.clamp ?? false,
      speed: entry?.speed ?? null,
    });
  }
  return resolved;
}

/** Actions in `resolved` whose clip could not be found. */
export function unresolvedActions(resolved) {
  return [...resolved.values()].filter((r) => !r.clip).map((r) => r.action);
}

/**
 * A set of clips (already retargeted to one skeleton) with the action
 * mapping resolved against them.
 */
export class AnimationLibrary {
  /** `rig` (from `captureRig`) is needed for upper / lower body layers. */
  constructor(clips, { config = ACTION_CONFIG, rig = null } = {}) {
    this.config = config;
    this.rig = rig;
    this.clips = new Map(clips.map((clip) => [clip.name, clip]));
    this.resolved = resolveActions(this.clips.keys(), config);
    this.masked = new Map();
  }

  /** Resolution record for `action` (falls back to the default action for unknown names). */
  resolve(action) {
    return this.resolved.get(action) ?? this.resolved.get(this.config.defaultFallback);
  }

  /** The AnimationClip that plays for `action`. */
  clipFor(action) {
    return this.clips.get(this.resolve(action).clip) ?? null;
  }

  /**
   * The clip for `action` limited to one half of the body: 'upper' is the
   * chest, arms and head (spine_02 and everything above it), 'lower' the rest.
   */
  layerClip(action, half) {
    const clip = this.clipFor(action);
    if (!clip || !this.rig) return clip;
    const key = `${clip.name}#${half}`;
    if (!this.masked.has(key)) {
      const upper = new Set(boneSubtree(this.rig, UPPER_BODY_ROOT));
      const bones = this.rig.bones.map((b) => b.name).filter((n) => (half === 'upper') === upper.has(n));
      this.masked.set(key, maskClip(clip, bones, key));
    }
    return this.masked.get(key);
  }

  /** Every registered action name, required ones first, for the debug cycler. */
  actionNames() {
    const rest = [...this.resolved.keys()].filter((a) => !REQUIRED_ACTIONS.includes(a)).sort();
    return [...REQUIRED_ACTIONS, ...rest];
  }

  /**
   * The idle variants from `wanted` (default: all), keeping only one action
   * per distinct clip and skipping any that ended up on the plain idle clip,
   * so every variant really looks different.
   */
  idleVariants(wanted = IDLE_VARIANTS) {
    const idleClip = this.resolve('idle').clip;
    const seen = new Set([idleClip]);
    const out = [];
    for (const action of wanted) {
      const { clip } = this.resolve(action);
      if (!clip || seen.has(clip)) continue;
      seen.add(clip);
      out.push(action);
    }
    return out;
  }
}
