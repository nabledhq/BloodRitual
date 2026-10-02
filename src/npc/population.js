import { createNpcBody } from './assets.js';
import { Npc } from './npc.js';
import { POPULATION, ROLE_CONFIG, SOCIAL } from './roles.js';
import { createRng } from '../rng.js';

/**
 * The camp's NPCs: spawns the demo population (one or more NPCs per role,
 * from `roles.json`), updates them, lets idle neighbours turn to each other
 * and talk, and holds the debug selection used to step an NPC through every
 * registered action.
 */
export class NpcPopulation {
  constructor(assets, { groundAt, config = ROLE_CONFIG, population = POPULATION, social = SOCIAL, seed = 1900, log = null } = {}) {
    this.social = social;
    this.rng = createRng(seed);
    const materials = new Map();
    this.npcs = population.map((entry) => {
      const role = config.roles[entry.role];
      const look = entry.look ?? role.look;
      const body = createNpcBody(assets, look, materials);
      return new Npc({
        name: entry.name,
        roleName: entry.role,
        role,
        body,
        library: assets.models.get(look.model).library,
        at: entry.at,
        startTask: entry.startTask ?? 0,
        prompt: entry.prompt ?? null,
        groundAt,
        rng: createRng(entry.seed ?? 1),
        config,
        log: log ? (message) => log(`${entry.name}: ${message}`) : null,
      });
    });
    this.selectedIndex = -1;
    this.debugActionIndex = -1;
  }

  get groups() {
    return this.npcs.map((npc) => npc.group);
  }

  get selected() {
    return this.npcs[this.selectedIndex] ?? null;
  }

  update(delta) {
    for (const npc of this.npcs) npc.update(delta);
    this.pairUpTalkers(delta);
  }

  /** Idle NPCs within talking distance may face each other and talk. */
  pairUpTalkers(delta) {
    const free = this.npcs.filter((npc) => npc.canChat());
    const chance = 1 - Math.exp(-this.social.talkChancePerSecond * delta);
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const a = free[i];
        const b = free[j];
        if (a.chat || b.chat) continue;
        if (a.position.distanceTo(b.position) > this.social.talkRadius) continue;
        if (this.rng() > chance) continue;
        const [min, max] = this.social.talkSeconds;
        const seconds = min + (max - min) * this.rng();
        a.startChat(b, seconds);
        b.startChat(a, seconds);
      }
    }
  }

  /** Debug: selects the next NPC (wrapping round) and returns it. */
  selectNext() {
    this.selectedIndex = (this.selectedIndex + 1) % this.npcs.length;
    this.debugActionIndex = -1;
    return this.selected;
  }

  /** Debug: plays the next registered action on the selected NPC; returns the resolution record. */
  playNextAction() {
    const npc = this.selected ?? this.selectNext();
    const actions = npc.controller.library.actionNames();
    this.debugActionIndex = (this.debugActionIndex + 1) % actions.length;
    const action = actions[this.debugActionIndex];
    npc.debugPlay(action);
    return npc.controller.library.resolve(action);
  }

  /** Debug: returns the selected NPC to its schedule. */
  resumeSelected() {
    this.selected?.resume();
    this.debugActionIndex = -1;
  }

  dispose() {
    for (const npc of this.npcs) npc.dispose();
  }
}
