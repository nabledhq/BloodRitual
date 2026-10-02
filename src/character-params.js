import { Color, SRGBColorSpace } from './procedural/index.js';
import { createRng } from './rng.js';

/**
 * Seeded, parametric description of a Seminole person of around 1900.
 *
 * `generateCharacterParams(seed, variant)` returns plain data (no engine
 * objects): body proportions, face shape, skin, hair, eyes and clothing.
 * The same seed and variant always give identical parameters; different
 * seeds give visibly different people. `createCharacter` in character.js
 * turns the parameters into meshes.
 *
 * Proportions follow anthropometric ranges: adults are 7.2-7.7 heads tall
 * (elders slightly less), children 5.5-6.3 and teens about 6.8, with arm
 * span roughly equal to height.
 *
 * Clothing is limited to what Seminole people wore around 1900: cotton
 * big shirts, cape blouses and long skirts with applique bands and simple
 * patchwork, wool turbans, sashes and leggings, buckskin moccasins (or bare
 * feet) and strands of glass trade beads. All colours are muted natural or
 * early trade-cloth dyes.
 */

export const VARIANTS = Object.freeze({
  elderMan: Object.freeze({ sex: 'male', age: [62, 78], height: [1.6, 1.72] }),
  elderWoman: Object.freeze({ sex: 'female', age: [60, 76], height: [1.48, 1.6] }),
  man: Object.freeze({ sex: 'male', age: [24, 45], height: [1.64, 1.79] }),
  woman: Object.freeze({ sex: 'female', age: [22, 42], height: [1.53, 1.66] }),
  teen: Object.freeze({ sex: null, age: [13, 16], height: { male: [1.52, 1.68], female: [1.48, 1.6] } }),
  child: Object.freeze({ sex: null, age: [6, 9], height: [1.12, 1.32] }),
});

export const VARIANT_NAMES = Object.freeze(Object.keys(VARIANTS));

/** Muted, period dyes (sRGB). */
export const DYES = Object.freeze({
  red: [0x8e3b2f, 0x9a3a2c, 0x7a2e2a, 0xa04a36],
  indigo: [0x34445e, 0x2e3b55, 0x3e5070, 0x46566b],
  ochre: [0xa8862f, 0xb59a4a, 0x9c7a34],
  green: [0x4f5f3e, 0x5d6b45, 0x485a48],
  purple: [0x5b4a6b, 0x6b5a7a, 0x56405a],
  muslin: [0xd5c9ad, 0xcfc2a4, 0xc9bb98, 0xd8cdb4],
  brown: [0x6b4a32, 0x5a3e2b],
  black: [0x2a2624],
});

/** Glass trade-bead colours. */
export const BEAD_COLORS = Object.freeze([0x3e5f8a, 0x8a2f2a, 0x2f6f6a, 0xb08a3a, 0xd8d2c4, 0x22252e, 0x6a7fa0]);

/** Smoked buckskin shades. */
export const LEATHER_COLORS = Object.freeze([0x8a6a4a, 0x7a5a3c, 0x9a7a56, 0x6e523a]);

function interp(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

/** Typical number of head heights in standing height at a given age. */
export function headsTallForAge(age) {
  const base = interp([[5, 5.5], [9, 6.0], [12, 6.5], [16, 7.0], [20, 7.45], [55, 7.45], [75, 7.3]], age);
  return base;
}

/** Hip-joint height as a fraction of standing height at a given age. */
function legRatioForAge(age, sex) {
  const adult = sex === 'female' ? 0.5 : 0.51;
  return interp([[5, 0.44], [9, 0.465], [13, 0.485], [17, adult]], age);
}

const round = (v, digits = 4) => Math.round(v * 10 ** digits) / 10 ** digits;

/**
 * Generates a complete, deterministic character description.
 * `overrides` may fix `sex`, `age` or `height` (useful for the player).
 */
export function generateCharacterParams(seed = 1, variant = 'man', overrides = {}) {
  const spec = VARIANTS[variant];
  if (!spec) throw new Error(`Unknown character variant "${variant}"`);
  const rng = createRng((Math.imul(seed >>> 0, 2654435761) ^ VARIANT_NAMES.indexOf(variant) * 97531) >>> 0);
  const range = (a, b) => a + (b - a) * rng();
  // Roughly normal in [-1, 1] (sum of uniforms), for "most people are average" traits.
  const trait = () => (rng() + rng() + rng()) / 1.5 - 1;
  const pick = (list) => list[Math.floor(rng() * list.length)];

  const sex = overrides.sex ?? spec.sex ?? (rng() < 0.5 ? 'male' : 'female');
  const female = sex === 'female';
  const age = round(overrides.age ?? range(spec.age[0], spec.age[1]), 1);
  const child = age < 12;
  const teen = age >= 12 && age < 18;
  const elder = age >= 58;
  const heightRange = Array.isArray(spec.height) ? spec.height : spec.height[sex];

  // ---- Body -------------------------------------------------------------
  const height = round(overrides.height ?? range(heightRange[0], heightRange[1]), 3);
  const build = round(trait() * (child ? 0.5 : 1), 3);
  const adultHeads = elder ? [7.12, 7.55] : [7.2, 7.72];
  const headsTall = round(age >= 18 ? range(adultHeads[0], adultHeads[1]) : headsTallForAge(age) + trait() * 0.12, 3);
  const body = {
    height,
    build,
    headsTall,
    headHeight: round(height / headsTall),
    legRatio: round(legRatioForAge(age, sex) + trait() * 0.008),
    // Shoulder-joint spacing and hip-joint spacing as fractions of height.
    shoulderWidth: round((child ? 0.172 : female ? 0.178 : 0.194) * (1 + build * 0.05) + trait() * 0.004),
    hipWidth: round((female && !child ? 0.104 : 0.094) * (1 + build * 0.06)),
    armSpanRatio: round((female ? 1.0 : 1.02) + (child ? 0.01 : 0) + trait() * 0.012),
    neckLength: round(child ? 0.28 : female ? 0.36 : 0.33),
    stoop: round(elder ? range(0.07, 0.15) : range(0, 0.02)),
  };

  // ---- Face -------------------------------------------------------------
  // Sexual dimorphism and age shift the means; `trait()` adds individuality.
  const male = female ? 0 : child ? 0.2 : 1;
  const face = {
    width: round(1 + trait() * 0.05 + build * 0.025 + (child ? 0.04 : 0)),
    jaw: round(0.5 + male * 0.2 + trait() * 0.18),
    chin: round(0.5 + male * 0.15 + trait() * 0.25),
    brow: round(0.25 + male * 0.45 + trait() * 0.2 - (child ? 0.15 : 0)),
    cheek: round(0.6 + trait() * 0.3),
    socket: round(0.5 + trait() * 0.2 + (elder ? 0.25 : 0)),
    noseLength: round(0.5 + trait() * 0.3 + (child ? -0.35 : 0)),
    noseWidth: round(0.55 + male * 0.1 + trait() * 0.25),
    noseBridge: round(0.45 + male * 0.15 + trait() * 0.3 - (child ? 0.3 : 0)),
    lips: round(0.55 - (elder ? 0.15 : 0) + trait() * 0.25),
    mouthWidth: round(0.5 + trait() * 0.25),
    eyeSpacing: round(0.5 + trait() * 0.25),
    eyeSize: round(0.5 + trait() * 0.2 + (child ? 0.3 : 0)),
    eyeHeight: round(trait() * 0.5 + (child ? -0.6 : 0)),
    lidOpen: round(0.55 + trait() * 0.2 - (elder ? 0.15 : 0)),
    earSize: round(0.5 + trait() * 0.25 + (elder ? 0.2 : 0)),
    // Small per-side differences so the face is not mirror-perfect.
    asymmetry: {
      eye: round(range(-1, 1) * 0.012),
      brow: round(range(-1, 1) * 0.015),
      cheek: round(range(-1, 1) * 0.12),
      mouth: round(range(-1, 1) * 0.04),
      nose: round(range(-1, 1) * 0.05),
      jaw: round(range(-1, 1) * 0.06),
    },
    noiseSeed: Math.floor(rng() * 1000),
  };

  // ---- Skin, hair, eyes -------------------------------------------------
  const skinColor = new Color().setHSL(range(0.05, 0.075), range(0.27, 0.4), range(0.25, 0.37), SRGBColorSpace);
  const skin = {
    tone: skinColor.getHex(SRGBColorSpace),
    redness: round(range(0.4, 1)),
    // Strength of the pore / wrinkle detail normal map.
    detail: round(interp([[6, 0.15], [16, 0.22], [30, 0.3], [50, 0.42], [75, 0.55]], age)),
    ageBucket: elder ? 'elder' : age >= 30 ? 'adult' : 'young',
  };

  const gray = elder ? range(0.35, 0.8) : age > 40 ? range(0, 0.15) : 0;
  const hairBase = new Color().setHSL(range(0.04, 0.08), range(0.15, 0.3), range(0.06, 0.1), SRGBColorSpace);
  const hairColor = hairBase.lerp(new Color(0x8c8884), gray);
  const hair = {
    color: hairColor.getHex(SRGBColorSpace),
    gray: round(gray),
    // Women and girls wore long hair in a bun (girls sometimes loose);
    // men's hair was short under the turban and boys' was cropped.
    style: female ? (child && rng() < 0.6 ? 'long' : 'bun') : child || teen ? 'cropped' : 'short',
    density: round(elder ? range(0.6, 0.85) : range(0.85, 1)),
  };
  const irisColor = new Color().setHSL(range(0.05, 0.08), range(0.4, 0.6), range(0.1, 0.17), SRGBColorSpace);
  const eyes = { iris: irisColor.getHex(SRGBColorSpace) };

  // ---- Clothing ---------------------------------------------------------
  const trims = [...DYES.red, ...DYES.indigo, ...DYES.ochre, ...DYES.green, ...DYES.purple];
  const trim = () => pick(trims);
  const patchwork = { colors: [trim(), pick(DYES.muslin)], pattern: pick(['bars', 'sawtooth']), blocks: 18 + Math.floor(rng() * 3) * 6 };
  const footwear = elder || (!child && rng() < 0.75) ? 'moccasins' : 'barefoot';
  const leather = pick(LEATHER_COLORS);
  let clothing;
  if (!female) {
    const turban = !child && !teen;
    clothing = {
      outfit: child ? 'boy' : teen ? 'youth' : 'man',
      shirt: rng() < 0.6 ? pick(DYES.muslin) : pick([...DYES.indigo, ...DYES.red, ...DYES.ochre]),
      bands: [trim(), trim(), trim()],
      patchwork,
      // Elders wore longer shirts.
      shirtLength: round(elder ? range(0.08, 0.14) : child ? range(0.02, 0.06) : range(-0.02, 0.05)),
      sash: turban || teen ? [trim(), trim()] : null,
      belt: leather,
      neckerchief: turban || rng() < 0.4 ? pick([...DYES.red, ...DYES.indigo, ...DYES.purple]) : null,
      turban: turban ? { colors: [trim(), trim(), pick(DYES.muslin)], wraps: 4 + Math.floor(rng() * 2) + (elder ? 1 : 0) } : null,
      leggings: elder || (!child && !teen && rng() < 0.6) ? pick([...DYES.red, ...DYES.indigo, ...DYES.black]) : null,
      footwear,
      leather,
      beadStrands: 0,
      beadColors: [],
    };
  } else {
    const strands = elder ? 10 + Math.floor(rng() * 5) : child ? 3 + Math.floor(rng() * 2) : teen ? 6 + Math.floor(rng() * 3) : 8 + Math.floor(rng() * 4);
    clothing = {
      outfit: child ? 'girl' : 'woman',
      blouse: pick([...DYES.muslin, ...DYES.indigo, ...DYES.purple]),
      cape: pick([...DYES.muslin, ...DYES.ochre, ...DYES.indigo, ...DYES.red]),
      capeBand: trim(),
      skirt: Array.from({ length: 5 }, trim),
      patchwork,
      belt: leather,
      footwear,
      leather,
      beadStrands: strands,
      beadColors: [pick(BEAD_COLORS), pick(BEAD_COLORS), pick(BEAD_COLORS)],
      leggings: null,
      turban: null,
      sash: null,
      neckerchief: null,
    };
  }

  return deepFreeze({ seed, variant, sex, age, body, face, skin, hair, eyes, clothing });
}

function deepFreeze(object) {
  for (const value of Object.values(object)) if (value && typeof value === 'object') deepFreeze(value);
  return Object.freeze(object);
}

/** Flattens the numeric face parameters into a vector (for comparisons). */
export function faceVector(params) {
  const { asymmetry, noiseSeed, ...shape } = params.face;
  return [...Object.values(shape), ...Object.values(asymmetry)];
}

/** Numeric body parameters as a vector. */
export function bodyVector(params) {
  return Object.values(params.body);
}
