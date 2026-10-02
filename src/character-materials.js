import * as THREE from 'three';
import { generateSet, tfbm, tnoise, weave } from './textures.js';
import { smoothstep, lerp, hash2, valueNoise } from './noise.js';

/**
 * Procedural textures and PBR materials for people.
 *
 * Every material is tagged with `userData.kind` (skin, hair, sclera, iris,
 * cornea, cotton, wool, leather, beads) and given its own roughness / sheen
 * response so skin, hair, eyes and the different cloths read as different
 * substances. Roughness maps are normalised around 1, so `material.roughness`
 * is the nominal roughness of the surface.
 *
 * Garments, beads and turbans use vertex colours for their dyes, so one
 * shared material per cloth type serves every character and a whole garment
 * can be merged into a single draw call.
 */

const TAU = Math.PI * 2;
const fract = (x) => x - Math.floor(x);

// ---- Texture recipes ------------------------------------------------------

/** Skin: tone mottling, pores, micro-lines and age-dependent creases. */
function skinRecipe(wrinkles) {
  return (u, v) => {
    const tone = tfbm(u, v, 4, 4, 201, 4);
    const blotch = tfbm(u, v, 16, 16, 202, 3);
    const pore = smoothstep(0.62, 0.82, tnoise(u, v, 160, 160, 203));
    const micro = tnoise(u, v, 48, 192, 204) * 0.5 + tnoise(u, v, 192, 48, 205) * 0.5;
    // Wavy, broken creases running around the body (v runs up the surface).
    const warp = tfbm(u, v, 3, 3, 206, 3);
    const line = Math.abs(Math.sin(Math.PI * (v * 18 + warp * 4)));
    const crease = (1 - smoothstep(0, 0.22, line)) * smoothstep(0.3, 0.65, tfbm(u, v, 5, 5, 207, 3));
    const fine = (1 - smoothstep(0, 0.3, Math.abs(Math.sin(Math.PI * (u * 40 + v * 12 + warp * 6))))) * 0.5;
    const g = 0.9 + 0.12 * tone - 0.04 * pore;
    return {
      color: [g * (1 + 0.04 * (blotch - 0.5)), g * (0.99 - 0.02 * (blotch - 0.5)), g * 0.97],
      height: 0.6 + 0.1 * tone - 0.3 * pore + 0.08 * micro - wrinkles * (0.4 * crease + 0.08 * fine),
      roughness: 0.82 + 0.18 * pore + 0.05 * wrinkles * crease,
    };
  };
}

/** One layer of hair strands of varying width and length (tips at v = 0). */
function strandLayer(u, v, count, seed) {
  const x = u * count;
  const id = Math.floor(x);
  const f = x - id;
  const r1 = hash2(id % count, 1, seed);
  const r2 = hash2(id % count, 2, seed);
  const r3 = hash2(id % count, 3, seed);
  // Strands wander slightly sideways along their length.
  const wander = (valueNoise(id * 0.37, v * 3, 0, seed) - 0.5) * 0.5;
  const d = Math.abs(f - 0.5 + wander * 0.3) * 2;
  const width = 0.45 + 0.4 * r1;
  const core = 1 - smoothstep(width * 0.4, width, d);
  const tip = 0.06 + 0.4 * r2;
  const length = smoothstep(tip, tip + 0.15, v);
  return { coverage: core * length, shade: 0.75 + 0.25 * r3 };
}

function hairRecipe(u, v) {
  const a = strandLayer(u, v, 40, 301);
  const b = strandLayer(fract(u + 0.013), v, 64, 302);
  const c = strandLayer(fract(u + 0.031), v, 96, 303);
  const coverage = Math.max(a.coverage, b.coverage * 0.95, c.coverage * 0.9);
  const shade = a.coverage >= b.coverage ? a.shade : b.shade;
  const along = 0.9 + 0.1 * tnoise(u, v, 64, 4, 304);
  const g = (0.55 + 0.45 * coverage) * shade * along;
    // Above v = 0.55 the layer is dense (scalp coverage); below it strands thin out to tips.
  const alpha = Math.max(smoothstep(0.15, 0.6, coverage), smoothstep(0.5, 0.65, v));
  return { color: [g, g, g], height: coverage, roughness: 0.85 + 0.15 * (1 - coverage), alpha };
}

/** Cotton: fine weave, vertical folds, seam ridges and running stitches at the band edges. */
function clothRecipe(u, v) {
  const w = weave(u, v, 96);
  const warp = tfbm(u, v, 2, 2, 311, 2);
  const folds = Math.sin(TAU * (u * 4 + warp * 0.8)) * (0.6 + 0.4 * tfbm(u, v, 4, 1, 312, 2));
  const seam = smoothstep(0.07, 0.0, v) + smoothstep(0.93, 1.0, v);
  const dash = fract(u * 96) < 0.55 ? 1 : 0;
  const stitch = dash * (1 - smoothstep(0.004, 0.012, Math.min(Math.abs(v - 0.11), Math.abs(v - 0.89))));
  const slub = tfbm(u, v, 8, 64, 313, 3);
  const g = (0.86 + 0.14 * w) * (0.95 + 0.05 * slub) * (0.92 + 0.08 * (folds * 0.5 + 0.5)) * (1 - 0.12 * seam) + 0.12 * stitch;
  return {
    color: [g, g, g],
    height: 0.45 + 0.3 * folds + 0.04 * w + 0.25 * seam + 0.15 * stitch,
    roughness: 0.9 + 0.1 * (1 - w),
  };
}

/** Wool: fuzzy, felted twill. */
function woolRecipe(u, v) {
  const twill = 0.5 + 0.5 * Math.sin(TAU * (u * 48 + v * 48));
  const fuzz = tnoise(u, v, 128, 128, 321) * 0.6 + tfbm(u, v, 16, 16, 322, 3) * 0.4;
  const folds = Math.sin(TAU * (v * 3 + tfbm(u, v, 2, 2, 323, 2)));
  const g = 0.82 + 0.1 * twill + 0.08 * fuzz;
  return { color: [g, g, g], height: 0.5 + 0.2 * folds + 0.15 * twill + 0.15 * fuzz, roughness: 0.92 + 0.08 * fuzz };
}

/** Smoked buckskin: pebbled grain, creases, uneven colour. */
function leatherRecipe(u, v) {
  const grain = smoothstep(0.35, 0.75, tnoise(u, v, 96, 96, 331));
  const crease = 1 - smoothstep(0, 0.15, Math.abs(Math.sin(Math.PI * (v * 6 + tfbm(u, v, 3, 3, 332, 3) * 3))));
  const stain = tfbm(u, v, 4, 4, 333, 4);
  const g = (0.8 + 0.2 * stain) * (0.95 + 0.05 * grain) * (1 - 0.15 * crease);
  return { color: [g, g * 0.98, g * 0.95], height: 0.5 + 0.2 * grain - 0.35 * crease, roughness: 0.75 + 0.25 * grain };
}

/** Strung glass seed beads along u (one tile = 32 beads). */
function beadRecipe(u, v) {
  const x = fract(u * 32) - 0.5;
  const id = Math.floor(u * 32);
  const bump = Math.sqrt(Math.max(0, 1 - (x * 2.1) ** 2));
  const across = Math.sqrt(Math.max(0, 1 - ((v - 0.5) * 1.6) ** 2));
  const g = (0.88 + 0.12 * hash2(id, 5, 341)) * (0.55 + 0.45 * bump);
  return { color: [g, g, g], height: bump * across, roughness: bump > 0.2 ? 0.6 + 0.4 * (1 - bump) : 1 };
}

/** Iris: pupil, radial fibres, collarette and dark limbal ring (planar UVs). */
function irisRecipe(u, v) {
  const dx = u - 0.5;
  const dy = v - 0.5;
  const r = Math.hypot(dx, dy) * 2;
  const angle = Math.atan2(dy, dx) / TAU + 0.5;
  const fibres = valueNoise(angle * 90, r * 6, 90, 351) * 0.6 + valueNoise(angle * 37, r * 2, 37, 352) * 0.4;
  const pupil = 1 - smoothstep(0.26, 0.3, r);
  const collarette = Math.exp(-(((r - 0.48) / 0.06) ** 2));
  const limbal = smoothstep(0.75, 0.95, r);
  let c = [0.36, 0.21, 0.11].map((k, i) => k * (0.6 + 0.6 * fibres) * (1 + 0.5 * collarette * [1, 0.9, 0.6][i]));
  c = c.map((k) => lerp(k, 0.05, limbal * 0.85));
  c = c.map((k) => lerp(k, 0.015, pupil));
  return { color: c, height: fibres * (1 - pupil), roughness: 1 };
}

const RECIPES = {
  'skin-young': [skinRecipe(0.1), 1.6],
  'skin-adult': [skinRecipe(0.4), 1.6],
  'skin-elder': [skinRecipe(0.7), 1.5],
  hair: [hairRecipe, 0.4],
  cloth: [clothRecipe, 4],
  wool: [woolRecipe, 2],
  leather: [leatherRecipe, 2],
  beads: [beadRecipe, 3],
  iris: [irisRecipe, 1],
};

const textureCache = new Map();

/** Cached `{ map, normalMap, roughnessMap }` for a character texture set. */
export function getCharacterTextureSet(name) {
  if (!RECIPES[name]) throw new Error(`Unknown character texture "${name}"`);
  if (!textureCache.has(name)) {
    const [recipe, normalStrength] = RECIPES[name];
    textureCache.set(name, generateSet(name, recipe, { normalStrength, size: name === 'iris' ? 128 : 256 }));
  }
  return textureCache.get(name);
}

function repeated(name, rx, ry = rx) {
  const base = getCharacterTextureSet(name);
  const out = {};
  for (const kind of ['map', 'normalMap', 'roughnessMap']) {
    const tex = base[kind].clone();
    tex.repeat.set(rx, ry);
    tex.needsUpdate = true;
    out[kind] = tex;
  }
  return out;
}

// ---- Skin shading -----------------------------------------------------------

/** The diffuse line of three.js' physical direct lighting that the skin shader replaces. */
export const SKIN_DIFFUSE_SOURCE = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';

/**
 * Wrapped, colour-shifted diffuse: light bleeds a little past the
 * terminator, red most of all, approximating subsurface scattering so the
 * skin does not look like plastic.
 */
const SKIN_DIFFUSE_PATCH = `
	vec3 sssWrap = vec3( 0.42, 0.22, 0.15 );
	float sssNdL = dot( geometryNormal, directLight.direction );
	vec3 sssIrradiance = clamp( ( vec3( sssNdL ) + sssWrap ) / ( 1.0 + sssWrap ), 0.0, 1.0 ) * directLight.color;
	reflectedLight.directDiffuse += sssIrradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );`;

export function applySkinShading(material) {
  material.userData.subsurface = { wrap: [0.42, 0.22, 0.15] };
  material.onBeforeCompile = (shader) => {
    const chunk = THREE.ShaderChunk.lights_physical_pars_fragment.replace(SKIN_DIFFUSE_SOURCE, SKIN_DIFFUSE_PATCH);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', chunk);
  };
  material.customProgramCacheKey = () => 'seminole-skin-sss';
  return material;
}

// ---- Materials ---------------------------------------------------------------

const cache = new Map();

function cached(key, create) {
  if (!cache.has(key)) {
    const material = create();
    material.name = key;
    cache.set(key, material);
  }
  return cache.get(key);
}

function tag(material, kind) {
  material.userData.kind = kind;
  return material;
}

/** Nominal roughness / sheen per material kind (also asserted by the tests). */
export const SURFACE = Object.freeze({
  skin: { roughness: 0.5, sheen: 0.3 },
  hair: { roughness: 0.72, sheen: 0 },
  sclera: { roughness: 0.12, sheen: 0 },
  iris: { roughness: 0.3, sheen: 0 },
  cornea: { roughness: 0.03, sheen: 0 },
  cotton: { roughness: 0.88, sheen: 0.55 },
  wool: { roughness: 0.96, sheen: 0.85 },
  leather: { roughness: 0.62, sheen: 0.12 },
  beads: { roughness: 0.18, sheen: 0 },
});

/**
 * Skin in the given tone. Detail (pores and wrinkles) comes from the age
 * bucket's texture and `detail` scales the normal map strength.
 */
export function characterSkinMaterial(tone, ageBucket = 'adult', detail = 0.6) {
  const strength = Math.round(detail * 20) / 20;
  return cached(`skin:${tone}:${ageBucket}:${strength}`, () => {
    const set = repeated(`skin-${ageBucket}`, 3, 3);
    const material = new THREE.MeshPhysicalMaterial({
      color: tone,
      map: set.map,
      normalMap: set.normalMap,
      normalScale: new THREE.Vector2(strength, strength),
      roughnessMap: set.roughnessMap,
      roughness: SURFACE.skin.roughness,
      metalness: 0,
      sheen: SURFACE.skin.sheen,
      sheenRoughness: 0.45,
      sheenColor: new THREE.Color(0x8a6450),
      specularIntensity: 0.6,
      vertexColors: true,
    });
    material.userData.detail = strength;
    return applySkinShading(tag(material, 'skin'));
  });
}

/** Alpha-tested hair strands with low-gloss shading (dull highlights, weak reflections). */
export function hairMaterial(color) {
  return cached(`hair:${color}`, () => {
    const set = getCharacterTextureSet('hair');
    const material = new THREE.MeshPhysicalMaterial({
      color,
      map: set.map,
      normalMap: set.normalMap,
      roughnessMap: set.roughnessMap,
      roughness: SURFACE.hair.roughness,
      metalness: 0,
      normalScale: new THREE.Vector2(0.5, 0.5),
      specularIntensity: 0.2,
      envMapIntensity: 0.35,
      alphaTest: 0.4,
      alphaToCoverage: true,
      side: THREE.DoubleSide,
    });
    return tag(material, 'hair');
  });
}

export function scleraMaterial() {
  return cached('eye:sclera', () =>
    tag(new THREE.MeshStandardMaterial({ color: 0xe6ddd0, roughness: SURFACE.sclera.roughness, metalness: 0 }), 'sclera'),
  );
}

export function irisMaterial() {
  return cached('eye:iris', () => {
    const set = getCharacterTextureSet('iris');
    return tag(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: set.map,
        normalMap: set.normalMap,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughness: SURFACE.iris.roughness,
        metalness: 0,
        vertexColors: true,
      }),
      'iris',
    );
  });
}

/** Clear, glossy cornea dome: gives the eye its wet specular highlight. */
export function corneaMaterial() {
  return cached('eye:cornea', () =>
    tag(
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: SURFACE.cornea.roughness,
        metalness: 0,
        transparent: true,
        opacity: 0.12,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        ior: 1.376,
        depthWrite: false,
      }),
      'cornea',
    ),
  );
}

function clothMaterial(kind, setName, repeat, extra) {
  return cached(`garment:${kind}`, () => {
    const set = repeated(setName, ...repeat);
    return tag(
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: set.map,
        normalMap: set.normalMap,
        roughnessMap: set.roughnessMap,
        metalness: 0,
        vertexColors: true,
        ...extra,
      }),
      kind,
    );
  });
}

/** Woven cotton (shirts, blouses, capes, skirts, neckerchiefs). */
export const cottonMaterial = () =>
  clothMaterial('cotton', 'cloth', [3, 1], {
    roughness: SURFACE.cotton.roughness,
    sheen: SURFACE.cotton.sheen,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(0x8a8070),
  });

/** Wool (turbans, sashes, leggings): rougher with a fuzzier sheen. */
export const woolMaterial = () =>
  clothMaterial('wool', 'wool', [2, 2], {
    roughness: SURFACE.wool.roughness,
    sheen: SURFACE.wool.sheen,
    sheenRoughness: 0.9,
    sheenColor: new THREE.Color(0x9a9080),
  });

/** Smoked buckskin (moccasins, belts, pouches). */
export const leatherMaterial = () =>
  clothMaterial('leather', 'leather', [2, 2], {
    roughness: SURFACE.leather.roughness,
    sheen: SURFACE.leather.sheen,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0x60503c),
  });

/** Strung glass trade beads. */
export const beadMaterial = () =>
  clothMaterial('beads', 'beads', [3, 1], {
    roughness: SURFACE.beads.roughness,
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
    ior: 1.52,
  });
