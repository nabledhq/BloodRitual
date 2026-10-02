/**
 * Builds the NPC assets in public/models/npc from the CC0 Quaternius sources
 * (Universal Base Characters, Modular Character Outfits - Fantasy, Universal
 * Animation Library 1 + 2). Run `./fetch-sources.sh` first, then `npm run build`.
 *
 * Output:
 *   npc-characters.glb  one scene per NPC model. Every model is a full,
 *                       skinned character: the head of a base character and
 *                       the parts of an outfit, all bound to one shared
 *                       skeleton (each part keeps its own inverse bind
 *                       matrices). Optional hair meshes are toggled at runtime.
 *   npc-animations.glb  the clips the game uses on the UAL skeleton (no mesh).
 *                       Scale tracks and every translation track except the
 *                       pelvis are removed; the game retargets the rest.
 *
 * Textures are downscaled (max 1024 px) and stored as JPEG.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, Document } from '@gltf-transform/core';
import { mergeDocuments, prune, dedup, resample, compactPrimitive, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.NPC_SOURCES ?? path.join(here, 'sources/models/quaternius');
const OUT = path.join(here, '../../public/models/npc');
const io = new NodeIO();

/**
 * Body regions kept from the base character: the head and neck, which the
 * outfits do not include. A triangle is kept when every vertex is mostly
 * weighted to one of these bones and sits above `minY` (metres) near the
 * centre line (so T-posed arms are never included).
 */
const HEAD_BONES = new Set(['Head', 'neck_01', 'spine_03']);

/**
 * The NPC models. `skeleton` names the part whose skeleton (rest pose) all
 * other parts are bound to. Each part lists the source file and the output
 * mesh name for every mesh taken from it.
 */
const MODELS = [
  {
    name: 'man',
    skeleton: 'parts/Male_Peasant_Body.gltf',
    parts: [
      { file: 'base/Superhero_Male_FullBody.gltf', meshes: { SuperHero_Male: 'head', Eyes: 'eyes', Eyebrows: 'eyebrows' }, head: { minY: 1.47, maxX: 0.13 } },
      { file: 'parts/Male_Peasant_Body.gltf', meshes: { Male_Peasant_Body: 'body' } },
      { file: 'parts/Male_Peasant_Arms.gltf', meshes: { Male_Peasant_Arms: 'arms' } },
      { file: 'parts/Male_Peasant_Legs.gltf', meshes: { Male_Peasant_Legs: 'legs' } },
      { file: 'parts/Male_Peasant_Feet.gltf', meshes: { Male_Peasant_Feet: 'feet' } },
      { file: 'hair/Hair_SimpleParted.gltf', meshes: { Hair_SimpleParted: 'hair_parted' } },
      { file: 'hair/Hair_Buzzed.gltf', meshes: { Hair_Buzzed: 'hair_buzzed' } },
      { file: 'hair/Hair_Beard.gltf', meshes: { Hair_Beard: 'beard' } },
    ],
  },
  {
    name: 'woman',
    skeleton: 'parts/Female_Peasant_Body.gltf',
    parts: [
      { file: 'base/Superhero_Female_FullBody.gltf', meshes: { Superhero_Female: 'head', Eyes: 'eyes', Eyebrows: 'eyebrows' }, head: { minY: 1.42, maxX: 0.12 } },
      { file: 'parts/Female_Peasant_Body.gltf', meshes: { Female_Peasant_Body: 'body' } },
      { file: 'parts/Female_Peasant_Arms.gltf', meshes: { Female_Peasant_Arms: 'arms' } },
      { file: 'parts/Female_Peasant_Legs.gltf', meshes: { Female_Peasant_Legs: 'legs' } },
      { file: 'parts/Female_Peasant_Feet.gltf', meshes: { Female_Peasant_Feet: 'feet' } },
      { file: 'hair/Hair_Buns.gltf', meshes: { Hair_Buns: 'hair_buns' } },
      { file: 'hair/Hair_Long.gltf', meshes: { Hair_Long: 'hair_long' } },
    ],
  },
  {
    name: 'hunter',
    skeleton: 'parts/Male_Ranger_Body.gltf',
    parts: [
      { file: 'base/Superhero_Male_FullBody.gltf', meshes: { SuperHero_Male: 'head', Eyes: 'eyes', Eyebrows: 'eyebrows' }, head: { minY: 1.47, maxX: 0.13 } },
      { file: 'parts/Male_Ranger_Body.gltf', meshes: { Male_Ranger_Body: 'body' } },
      { file: 'parts/Male_Ranger_Arms.gltf', meshes: { Male_Ranger_Arms: 'arms' } },
      { file: 'parts/Male_Ranger_Legs.gltf', meshes: { Male_Ranger_Legs: 'legs' } },
      { file: 'parts/Male_Ranger_Feet_Boots.gltf', meshes: { Male_Ranger_Feet_Boots: 'feet' } },
      { file: 'hair/Hair_Long.gltf', meshes: { Hair_Long: 'hair_long' } },
      { file: 'hair/Hair_Buzzed.gltf', meshes: { Hair_Buzzed: 'hair_buzzed' } },
      { file: 'hair/Hair_Beard.gltf', meshes: { Hair_Beard: 'beard' } },
    ],
  },
];

/** Clips kept from the animation libraries (see src/npc/actions.json for how they are used). */
const CLIPS = {
  'anim_lib/UAL1_Standard.glb': [
    'Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop',
    'Sitting_Enter', 'Sitting_Idle_Loop', 'Sitting_Exit', 'Sitting_Talking_Loop', 'PickUp_Table', 'Interact',
    'Driving_Loop', 'Idle_Talking_Loop', 'Fixing_Kneeling', 'Punch_Cross', 'Punch_Jab', 'Pistol_Reload',
    'Pistol_Idle_Loop', 'Death01', 'Hit_Chest', 'Idle_Torch_Loop', 'Spell_Simple_Shoot', 'Push_Loop',
  ],
  'anim_lib/UAL2_Standard.glb': [
    'Consume', 'Farm_Harvest', 'Farm_PlantSeed', 'Farm_Watering', 'Idle_FoldArms_Loop', 'Idle_Lantern_Loop',
    'Idle_No_Loop', 'Yes', 'TreeChopping_Loop', 'Walk_Carry_Loop', 'Hit_Knockback', 'Zombie_Walk_Fwd_Loop',
    'Zombie_Scratch', 'Chest_Open', 'Idle_Rail_Call', 'OverhandThrow',
  ],
};

/** Reads a .gltf whose image URIs may have been renamed in the mirror (`X_png.png` -> `X.png`). */
async function readSource(file) {
  const full = path.join(SRC, file);
  if (file.endsWith('.glb')) return io.read(full);
  const json = JSON.parse(fs.readFileSync(full, 'utf8'));
  const dir = path.dirname(full);
  const resources = {};
  for (const r of [...(json.images ?? []), ...(json.buffers ?? [])]) {
    if (!r.uri) continue;
    let p = path.join(dir, r.uri);
    if (!fs.existsSync(p)) p = path.join(dir, r.uri.replace(/_png\.png$/, '.png'));
    resources[r.uri] = new Uint8Array(fs.readFileSync(p));
  }
  return io.readJSON({ json, resources });
}

function dominantJoints(prim, jointNames) {
  const J = prim.getAttribute('JOINTS_0');
  const W = prim.getAttribute('WEIGHTS_0');
  const out = [];
  const j = [];
  const w = [];
  for (let i = 0; i < J.getCount(); i++) {
    J.getElement(i, j);
    W.getElement(i, w);
    let best = 0;
    for (let k = 1; k < 4; k++) if (w[k] > w[best]) best = k;
    out.push(jointNames[j[best]]);
  }
  return out;
}

/** Keeps only the head and neck triangles of a full-body primitive. */
function cutToHead(doc, prim, jointNames, { minY, maxX }) {
  const dominant = dominantJoints(prim, jointNames);
  const P = prim.getAttribute('POSITION');
  const indices = prim.getIndices().getArray();
  const p = [];
  const keepVertex = (i) => {
    P.getElement(i, p);
    return HEAD_BONES.has(dominant[i]) && p[1] > minY && Math.abs(p[0]) < maxX;
  };
  const kept = [];
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]];
    if (tri.every(keepVertex)) kept.push(...tri);
  }
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(kept)).setBuffer(prim.getIndices().getBuffer()));
  compactPrimitive(prim);
}

/** Drops vertex attributes the game does not use (extra UV sets and Godot mask colours). */
function stripAttributes(prim) {
  for (const semantic of prim.listSemantics()) {
    if (semantic.startsWith('COLOR_') || (semantic.startsWith('TEXCOORD_') && semantic !== 'TEXCOORD_0')) {
      prim.setAttribute(semantic, null);
    }
  }
}

function descendants(node, out = []) {
  for (const child of node.listChildren()) {
    out.push(child);
    descendants(child, out);
  }
  return out;
}

async function buildCharacters() {
  const doc = new Document();
  doc.createBuffer();
  const sources = new Map();
  const source = async (file) => {
    if (!sources.has(file)) sources.set(file, await readSource(file));
    return sources.get(file);
  };

  for (const model of MODELS) {
    // The skeleton comes from the `skeleton` part: copy its Armature hierarchy.
    const before = new Set(doc.getRoot().listScenes());
    mergeDocuments(doc, await source(model.skeleton));
    const scene = doc.getRoot().listScenes().find((s) => !before.has(s));
    scene.setName(model.name);
    const armature = scene.listChildren().find((n) => n.getName() === 'Armature');
    armature.setName(`${model.name}_rig`);
    for (const n of descendants(armature)) if (n.getMesh()) n.dispose();
    const bones = new Map(descendants(armature).map((n) => [n.getName(), n]));

    for (const part of model.parts) {
      const seen = new Set(doc.getRoot().listScenes());
      mergeDocuments(doc, await source(part.file));
      const partScene = doc.getRoot().listScenes().find((s) => !seen.has(s));
      const partArmature = partScene.listChildren().find((n) => n.getName() === 'Armature');
      for (const node of descendants(partArmature)) {
        if (!node.getMesh()) continue;
        const outName = part.meshes[node.getName()];
        if (!outName) {
          node.dispose();
          continue;
        }
        const skin = node.getSkin();
        const jointNames = skin.listJoints().map((j) => j.getName());
        for (const prim of node.getMesh().listPrimitives()) {
          stripAttributes(prim);
          if (outName === 'head') cutToHead(doc, prim, jointNames, part.head);
        }
        // Bind the part to the model's skeleton, keeping its own inverse bind matrices.
        // Removing each joint and appending its replacement keeps the joint order (JOINTS_0 indices).
        for (const joint of skin.listJoints()) {
          const target = bones.get(joint.getName());
          if (!target) throw new Error(`${part.file}: bone ${joint.getName()} missing from ${model.skeleton}`);
          skin.removeJoint(joint);
          skin.addJoint(target);
        }
        skin.setSkeleton(bones.get('root'));
        skin.setName(`${model.name}_${outName}_skin`);
        node.setName(outName);
        node.getMesh().setName(`${model.name}_${outName}`);
        armature.addChild(node);
      }
      for (const n of descendants(partArmature)) n.dispose();
      partArmature.dispose();
      partScene.dispose();
    }
  }
  for (const s of doc.getRoot().listScenes()) if (!MODELS.some((m) => m.name === s.getName())) s.dispose();
  doc.getRoot().setDefaultScene(doc.getRoot().listScenes()[0]);

  // One buffer for everything.
  const buffer = doc.getRoot().listBuffers()[0];
  for (const accessor of doc.getRoot().listAccessors()) accessor.setBuffer(buffer);
  for (const b of doc.getRoot().listBuffers()) if (b !== buffer) b.dispose();

  await recolourRanger(doc);
  for (const material of doc.getRoot().listMaterials()) {
    // The outfits are single-sided cloth shells; double-sided keeps open hems from vanishing.
    material.setDoubleSided(true);
  }
  await doc.transform(
    dedup(),
    prune({ keepLeaves: false }),
    textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], quality: 82 }),
  );
  for (const texture of doc.getRoot().listTextures()) {
    const name = texture.getName() || texture.getURI();
    if (/Hair|Eye/.test(name)) await resizeTexture(texture, 512);
  }
  return doc;
}

async function resizeTexture(texture, size) {
  const image = texture.getImage();
  const out = await sharp(image).resize(size, size, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
  texture.setImage(new Uint8Array(out));
}

/**
 * The Ranger outfit is fantasy green; recolour the green cloth to smoked
 * buckskin brown so it reads as a 1900s hunter's leathers.
 */
async function recolourRanger(doc) {
  for (const texture of doc.getRoot().listTextures()) {
    const name = texture.getName() || texture.getURI();
    if (!/Ranger_BaseColor/.test(name)) continue;
    const { data, info } = await sharp(texture.getImage()).resize(2048, 2048).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (g > r * 1.08 && g > b * 1.08) {
        const l = 0.3 * r + 0.55 * g + 0.15 * b;
        data[i] = Math.min(255, l * 1.32);
        data[i + 1] = Math.min(255, l * 1.0);
        data[i + 2] = Math.min(255, l * 0.66);
      }
    }
    const png = await sharp(data, { raw: info }).png().toBuffer();
    texture.setImage(new Uint8Array(png)).setMimeType('image/png');
  }
}

/** Translation tracks kept: the pelvis carries the body's height and sway. */
const KEEP_TRANSLATION = new Set(['pelvis']);

async function buildAnimations() {
  const files = Object.keys(CLIPS);
  const doc = await io.read(path.join(SRC, files[0]));
  const nodesByName = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
  for (const file of files.slice(1)) {
    const extra = await io.read(path.join(SRC, file));
    // Check both libraries share the same rest pose before moving clips across.
    for (const n of extra.getRoot().listNodes()) {
      const mine = nodesByName.get(n.getName());
      if (mine && n.getTranslation().some((v, i) => Math.abs(v - mine.getTranslation()[i]) > 1e-3)) {
        throw new Error(`${file}: rest pose of ${n.getName()} differs from ${files[0]}`);
      }
    }
    const before = new Set(doc.getRoot().listAnimations());
    mergeDocuments(doc, extra);
    for (const anim of doc.getRoot().listAnimations()) {
      if (before.has(anim)) continue;
      if (!CLIPS[file].includes(anim.getName())) continue;
      for (const channel of anim.listChannels()) channel.setTargetNode(nodesByName.get(channel.getTargetNode().getName()));
      anim.setExtras({ source: file });
    }
  }
  const keep = new Set(Object.values(CLIPS).flat());
  const kept = new Set();
  for (const anim of doc.getRoot().listAnimations()) {
    const owner = anim.getExtras().source ?? files[0];
    if (!keep.has(anim.getName()) || !CLIPS[owner].includes(anim.getName()) || kept.has(anim.getName())) {
      for (const sampler of anim.listSamplers()) sampler.dispose();
      for (const channel of anim.listChannels()) channel.dispose();
      anim.dispose();
      continue;
    }
    kept.add(anim.getName());
    anim.setExtras({});
    for (const channel of anim.listChannels()) {
      const pathName = channel.getTargetPath();
      const node = channel.getTargetNode();
      if (pathName === 'scale' || (pathName === 'translation' && !KEEP_TRANSLATION.has(node.getName()))) {
        channel.getSampler().dispose();
        channel.dispose();
      }
    }
  }
  const missing = [...keep].filter((n) => !kept.has(n));
  if (missing.length) throw new Error(`clips not found: ${missing.join(', ')}`);

  // Keep the skeleton (needed for retargeting), drop the mannequin mesh.
  for (const node of doc.getRoot().listNodes()) {
    if (node.getMesh()) node.dispose();
  }
  for (const skin of doc.getRoot().listSkins()) skin.dispose();
  for (const scene of doc.getRoot().listScenes().slice(1)) scene.dispose();
  const buffer = doc.getRoot().listBuffers()[0];
  for (const accessor of doc.getRoot().listAccessors()) accessor.setBuffer(buffer);
  for (const b of doc.getRoot().listBuffers()) if (b !== buffer) b.dispose();
  await doc.transform(resample({ tolerance: 2e-4 }), dedup(), prune({ keepLeaves: true }));
  return doc;
}

fs.mkdirSync(OUT, { recursive: true });
const characters = await buildCharacters();
await io.write(path.join(OUT, 'npc-characters.glb'), characters);
const animations = await buildAnimations();
await io.write(path.join(OUT, 'npc-animations.glb'), animations);
for (const f of fs.readdirSync(OUT)) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1e6).toFixed(2), 'MB');
