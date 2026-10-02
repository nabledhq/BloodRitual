import ROLE_CONFIG from './roles.json' with { type: 'json' };
import { LAYOUT } from '../layout.js';

/**
 * Role profiles, places and the demo population, loaded from `roles.json`.
 *
 * A role defines how an NPC looks, its preferred idle variants (`idleSet`),
 * a walk-speed multiplier, its `workClip` (the action the `work` task plays)
 * and a looping task list. Task types:
 *
 * - `walk`   go to `to` (a place) through optional `via` places; `pace` is
 *            `walk` (default) or `run`; `posture` `stand` (default), `carry`
 *            or `crouch`.
 * - `work`   play the role's work clip for `seconds`.
 * - `play`   play `action` once (or for `seconds` if it loops).
 * - `idle`   stand for `seconds`, optionally starting with idle `variant`.
 *            Idle NPCs near each other may turn and talk.
 * - `sit`    sit on `seat` for `seconds`, optionally doing `action` with the
 *            upper body (eating, drinking), then stand up.
 * - `crouch` crouch for `seconds`.
 *
 * Every task may `face` a place. Places are names from `places`, names from
 * the camp layout (`firePit`, `chickee`, ...) or `[x, z]` pairs.
 */

export { ROLE_CONFIG };
export const ROLES = Object.freeze(ROLE_CONFIG.roles);
export const ROLE_NAMES = Object.freeze(Object.keys(ROLE_CONFIG.roles));
export const POPULATION = Object.freeze(ROLE_CONFIG.population);
export const NPC_MOVEMENT = Object.freeze(ROLE_CONFIG.movement);
export const SOCIAL = Object.freeze(ROLE_CONFIG.social);

export const TASK_TYPES = Object.freeze(['walk', 'work', 'play', 'idle', 'sit', 'crouch']);

/** Resolves a place name or `[x, z]` pair to `{ x, z }`. */
export function resolvePlace(place, config = ROLE_CONFIG) {
  if (Array.isArray(place)) return { x: place[0], z: place[1] };
  const named = config.places[place];
  if (named) return { x: named[0], z: named[1] };
  const seat = config.seats[place];
  if (seat) return { x: seat.at[0], z: seat.at[1] };
  const layout = LAYOUT[place];
  if (layout && typeof layout.x === 'number') return { x: layout.x, z: layout.z };
  throw new Error(`unknown place "${place}"`);
}

/** The seat called `name`: `{ x, z, face: { x, z } }`. */
export function resolveSeat(name, config = ROLE_CONFIG) {
  const seat = config.seats[name];
  if (!seat) throw new Error(`unknown seat "${name}"`);
  return { x: seat.at[0], z: seat.at[1], face: resolvePlace(seat.face, config) };
}

/** Returns a list of problems with the role config (empty when valid). */
export function validateRoles(config = ROLE_CONFIG) {
  const problems = [];
  const place = (p, where) => {
    try {
      resolvePlace(p, config);
    } catch (e) {
      problems.push(`${where}: ${e.message}`);
    }
  };
  for (const [name, role] of Object.entries(config.roles)) {
    for (const key of ['label', 'look', 'idleSet', 'walkSpeed', 'workClip', 'tasks']) {
      if (role[key] === undefined) problems.push(`${name}: missing ${key}`);
    }
    (role.tasks ?? []).forEach((task, i) => {
      const where = `${name} task ${i}`;
      if (!TASK_TYPES.includes(task.do)) problems.push(`${where}: unknown task type "${task.do}"`);
      if (task.do === 'walk') {
        place(task.to, where);
        for (const v of task.via ?? []) place(v, where);
      }
      if (task.face) place(task.face, where);
      if (task.do === 'sit' && !config.seats[task.seat]) problems.push(`${where}: unknown seat "${task.seat}"`);
      if (task.do === 'play' && !task.action) problems.push(`${where}: play needs an action`);
    });
  }
  for (const entry of config.population) {
    if (!config.roles[entry.role]) problems.push(`${entry.name}: unknown role "${entry.role}"`);
  }
  return problems;
}
