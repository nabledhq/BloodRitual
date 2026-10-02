import { createCharacter } from './character.js';
import { generateCharacterParams } from './character-params.js';
import { terrainHeight } from './terrain.js';
import { LAYOUT } from './layout.js';

/**
 * The people of the camp. Each is generated from a fixed seed, so they look
 * the same on every launch. `at` is where they stand (or null for the man
 * walking the camp loop) and `face` what they turn towards.
 */
export const VILLAGERS = Object.freeze([
  { name: 'npcWoman', seed: 41, variant: 'woman', at: [-3.3, -1.8], face: 'firePit', label: 'Villager', prompt: 'She is tending the cooking fire' },
  { name: 'npcElderWoman', seed: 7, variant: 'elderWoman', at: [-1.35, -2.0], face: 'firePit', label: 'Elder', prompt: 'She is watching the kettle and telling stories' },
  { name: 'npcChild', seed: 23, variant: 'child', sex: 'female', at: [-0.75, -1.15], face: [0, 2], label: 'Child', prompt: 'She is curious about you' },
  { name: 'npcElderMan', seed: 12, variant: 'elderMan', at: [3.6, -1.9], face: [0, 0], label: 'Elder', prompt: 'He is resting in the shade of the chickee' },
  { name: 'npcTeen', seed: 62, variant: 'teen', sex: 'male', at: [2.95, -0.55], face: 'mortar', label: 'Villager', prompt: 'He is waiting his turn at the corn mortar' },
  { name: 'npcHunter', seed: 77, variant: 'man', at: [-5.6, -5.0], face: 'canoe', label: 'Villager', prompt: 'He is checking the dugout canoe' },
  { name: 'npcMan', seed: 3, variant: 'man', at: null, label: 'Villager', prompt: 'He is walking back from the canoe' },
]);

function facing([x, z], target) {
  const [tx, tz] = Array.isArray(target) ? target : [LAYOUT[target].x, LAYOUT[target].z];
  return Math.atan2(tx - x, tz - z);
}

/** NPCs: six villagers of different ages standing about the camp and a man walking a loop through it. */
export function createNpcs() {
  return VILLAGERS.map((v) => {
    const npc = createCharacter(generateCharacterParams(v.seed, v.variant, v.sex ? { sex: v.sex } : {}));
    npc.name = v.name;
    npc.userData.interactive = { label: v.label, prompt: v.prompt };
    if (v.at) {
      const [x, z] = v.at;
      npc.position.set(x, terrainHeight(x, z), z);
      npc.rotation.y = facing(v.at, v.face);
      npc.userData.behaviour = 'idle';
    } else {
      npc.userData.behaviour = 'walk';
      npc.userData.path = LAYOUT.walkPath;
      npc.userData.speed = 1.1;
    }
    return npc;
  });
}

/** Position on the elliptical walk path after walking `distance` metres. */
export function walkPathPoint(path, distance) {
  // Approximate perimeter (Ramanujan) to convert distance to angle.
  const { rx, rz } = path;
  const perimeter = Math.PI * (3 * (rx + rz) - Math.sqrt((3 * rx + rz) * (rx + 3 * rz)));
  const angle = (distance / perimeter) * Math.PI * 2;
  const x = path.x + Math.cos(angle) * rx;
  const z = path.z + Math.sin(angle) * rz;
  // Tangent direction (counter-clockwise when seen from above is +angle).
  const dx = -Math.sin(angle) * rx;
  const dz = Math.cos(angle) * rz;
  return { x, z, heading: Math.atan2(dx, dz) };
}
