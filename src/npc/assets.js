import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AnimationLibrary } from './animation-library.js';
import { captureRig, retargetClip } from './retarget.js';

/**
 * Loading and instancing of the premade NPC characters.
 *
 * `public/models/npc/npc-characters.glb` holds one scene per model (see
 * tools/npc-assets/build.mjs); `npc-animations.glb` holds the shared clips on
 * the animation library's skeleton. Clips are retargeted once per model
 * skeleton when the assets load.
 */

const BASE_URL = import.meta.env?.BASE_URL ?? '/';

export const NPC_ASSET_URLS = Object.freeze({
  characters: `${BASE_URL}models/npc/npc-characters.glb`,
  animations: `${BASE_URL}models/npc/npc-animations.glb`,
});

/** Mesh names that are optional per NPC (hair styles and beards). */
const OPTIONAL_PART = /^(hair_|beard)/;

/** Which materials a look's `tint` entries recolour (matched on material name). */
const TINT_MATERIALS = Object.freeze({
  cloth: /Peasant|Ranger/,
  skin: /Superhero|Regular/,
  hair: /Hair/,
});

function defaultLoad(url) {
  return new GLTFLoader().loadAsync(url);
}

function rigSignature(rig) {
  return rig.bones.map((b) => [b.name, ...b.position.toArray(), ...b.quaternion.toArray()].map((v) => (typeof v === 'number' ? v.toFixed(4) : v)).join(',')).join(';');
}

/**
 * Loads the character models and the animation library. `load(url)` must
 * resolve to a parsed glTF (defaults to three's GLTFLoader).
 * Resolves to `{ models: Map<name, { template, rig, library }>, clips }`.
 */
export async function loadNpcAssets({ load = defaultLoad, urls = NPC_ASSET_URLS } = {}) {
  const [characters, animations] = await Promise.all([load(urls.characters), load(urls.animations)]);
  const sourceRig = captureRig(animations.scene);
  const libraries = new Map();
  const models = new Map();
  for (const scene of characters.scenes) {
    // GLTFLoader makes node names unique across the file; restore the bone names clips refer to.
    scene.traverse((o) => {
      if (o.userData.name) o.name = o.userData.name;
    });
    const rig = captureRig(scene);
    const signature = rigSignature(rig);
    if (!libraries.has(signature)) {
      libraries.set(signature, new AnimationLibrary(animations.animations.map((clip) => retargetClip(clip, sourceRig, rig)), { rig }));
    }
    models.set(scene.name, { template: scene, rig, library: libraries.get(signature) });
  }
  return { models, clips: animations.animations };
}

/**
 * Creates one NPC body from a loaded model. `look` picks the model, the
 * optional parts (`hair`, `beard`), colour tints multiplied over the
 * textures (`tint.cloth`, `tint.skin`, `tint.hair`) and a `height` scale.
 * Returns the cloned model root, ready to animate with an AnimationMixer.
 */
export function createNpcBody(assets, look, materialCache = new Map()) {
  const model = assets.models.get(look.model);
  if (!model) throw new Error(`unknown NPC model "${look.model}"`);
  const body = cloneSkinned(model.template);
  body.name = `${look.model}-body`;
  const show = new Set([look.hair, look.beard ? 'beard' : null].filter(Boolean));
  body.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (OPTIONAL_PART.test(o.name)) o.visible = show.has(o.name);
    o.material = tintedMaterial(o.material, look.tint, materialCache);
  });
  if (look.height) body.scale.setScalar(look.height);
  return body;
}

function tintedMaterial(material, tint = {}, cache) {
  if (Array.isArray(material)) return material.map((m) => tintedMaterial(m, tint, cache));
  const kind = Object.keys(TINT_MATERIALS).find((k) => TINT_MATERIALS[k].test(material.name));
  const colour = kind ? tint[kind] : null;
  if (!colour) return material;
  const key = `${material.uuid}:${colour}`;
  if (!cache.has(key)) {
    const tinted = material.clone();
    tinted.color.set(colour);
    cache.set(key, tinted);
  }
  return cache.get(key);
}
