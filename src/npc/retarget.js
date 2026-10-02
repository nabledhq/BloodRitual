import * as THREE from 'three';

/**
 * Retargeting of the animation library onto the NPC skeletons.
 *
 * Every NPC model and the animation library use the same bone names
 * (Quaternius' universal humanoid rig), but the rest poses differ a little:
 * bone lengths, shoulder width and the bend of the spine at rest. Copying
 * local rotations straight across would bake those differences into every
 * pose (a leaning chest, twisted shoulders), so each clip is converted with
 * a world-space delta: every bone is given the same rotation away from its
 * rest orientation as the source bone has. The pelvis translation (the only
 * translation track the library keeps) is scaled by the ratio of hip
 * heights, so feet stay on the ground on taller or shorter models.
 */

/** Frame rate retargeted clips are baked at. */
export const RETARGET_FPS = 30;

/**
 * Captures the rest pose of a skeleton hierarchy starting at the bone named
 * `rootName`: bones in parent-first order with their local rest transforms.
 */
export function captureRig(object, rootName = 'root') {
  let rootBone = null;
  object.traverse((o) => {
    if (!rootBone && o.name === rootName) rootBone = o;
  });
  if (!rootBone) throw new Error(`rig has no bone named "${rootName}"`);
  const bones = [];
  const visit = (node, parent) => {
    bones.push({ name: node.name, parent, quaternion: node.quaternion.clone(), position: node.position.clone() });
    for (const child of node.children) if (!child.isMesh) visit(child, node.name);
  };
  visit(rootBone, null);
  const byName = new Map(bones.map((b) => [b.name, b]));
  // Rest orientation of every bone in rig space (relative to the root's parent).
  for (const bone of bones) {
    const parent = bone.parent ? byName.get(bone.parent) : null;
    bone.world = parent ? parent.world.clone().multiply(bone.quaternion) : bone.quaternion.clone();
  }
  return { bones, byName };
}

function trackBone(track) {
  const dot = track.name.lastIndexOf('.');
  return [track.name.slice(0, dot), track.name.slice(dot + 1)];
}

/**
 * Converts `clip` (authored on `source`, a rig from `captureRig`) so it plays
 * correctly on `target`. Returns a new AnimationClip with the same name.
 */
export function retargetClip(clip, source, target, { fps = RETARGET_FPS } = {}) {
  const rotations = new Map();
  const translations = new Map();
  for (const track of clip.tracks) {
    const [bone, property] = trackBone(track);
    if (property === 'quaternion') rotations.set(bone, track.createInterpolant());
    else if (property === 'position') translations.set(bone, track.createInterpolant());
  }

  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  for (let f = 0; f < frames; f++) times[f] = (clip.duration * f) / (frames - 1);

  const animated = target.bones.filter((b) => rotations.has(b.name) && source.byName.has(b.name));
  const outRotations = new Map(animated.map((b) => [b.name, new Float32Array(frames * 4)]));
  const outTranslations = new Map();
  for (const [name] of translations) {
    if (target.byName.has(name) && source.byName.has(name)) outTranslations.set(name, new Float32Array(frames * 3));
  }

  const sourceWorld = new Map();
  const targetWorld = new Map();
  const q = new THREE.Quaternion();
  const delta = new THREE.Quaternion();
  const v = new THREE.Vector3();
  for (let f = 0; f < frames; f++) {
    const t = times[f];
    // Source pose in rig space.
    for (const bone of source.bones) {
      const interpolant = rotations.get(bone.name);
      if (interpolant) q.fromArray(interpolant.evaluate(t)).normalize();
      else q.copy(bone.quaternion);
      const parent = bone.parent ? sourceWorld.get(bone.parent) : null;
      const world = sourceWorld.get(bone.name) ?? new THREE.Quaternion();
      world.copy(parent ?? new THREE.Quaternion()).multiply(q);
      sourceWorld.set(bone.name, world);
    }
    // Same world-space change from rest on the target, back to local space.
    for (const bone of target.bones) {
      const parentWorld = bone.parent ? targetWorld.get(bone.parent) : null;
      const world = targetWorld.get(bone.name) ?? new THREE.Quaternion();
      const out = outRotations.get(bone.name);
      if (out) {
        const src = source.byName.get(bone.name);
        delta.copy(src.world).invert().premultiply(sourceWorld.get(bone.name));
        world.copy(delta).multiply(bone.world);
        q.copy(parentWorld ?? new THREE.Quaternion()).invert().multiply(world).normalize();
        q.toArray(out, f * 4);
      } else {
        world.copy(parentWorld ?? new THREE.Quaternion()).multiply(bone.quaternion);
      }
      targetWorld.set(bone.name, world);
    }
    for (const [name, out] of outTranslations) {
      const src = source.byName.get(name);
      const tgt = target.byName.get(name);
      const scale = tgt.position.length() / Math.max(1e-6, src.position.length());
      v.fromArray(translations.get(name).evaluate(t)).sub(src.position).multiplyScalar(scale).add(tgt.position);
      v.toArray(out, f * 3);
    }
  }

  const tracks = [];
  for (const [name, values] of outRotations) tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values));
  for (const [name, values] of outTranslations) tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, times, values));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/** Keeps only the tracks of `clip` that animate one of `boneNames` (for upper / lower body layers). */
export function maskClip(clip, boneNames, name = `${clip.name}#masked`) {
  const keep = new Set(boneNames);
  const tracks = clip.tracks.filter((track) => keep.has(trackBone(track)[0])).map((track) => track.clone());
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

/** Names of `boneName` and every bone below it in `rig`. */
export function boneSubtree(rig, boneName) {
  const names = new Set([boneName]);
  for (const bone of rig.bones) if (bone.parent && names.has(bone.parent)) names.add(bone.name);
  return [...names];
}
