import REPUTATION_CONFIG from './data/reputation.json';

/**
 * Per-faction reputation. Every faction, tier, action and effect comes from
 * `src/data/reputation.json`, so adding a faction or an action is a data
 * change only.
 *
 * Use `createReputation()` for an independent instance (tests, tools), or the
 * module-level functions (`applyAction`, `getReputation`, ...) which work on
 * a shared instance saved to `localStorage`.
 */

export { REPUTATION_CONFIG };

/** localStorage key the shared instance saves to. */
export const STORAGE_KEY = 'seminole.reputation.v1';

const SAVE_VERSION = 1;

/** Checks the config and fails loudly on typos, so bad data never reaches the game. */
export function validateConfig(config) {
  const { range, factions, tiers, actions, authorityAttention } = config;
  if (!(range.min < range.max) || range.start < range.min || range.start > range.max) {
    throw new Error('reputation: invalid range');
  }
  const ids = new Set();
  for (const { id } of factions) {
    if (!id || ids.has(id)) throw new Error(`reputation: duplicate or empty faction id "${id}"`);
    ids.add(id);
  }
  if (!tiers.length || tiers[0].min !== range.min) throw new Error('reputation: the first tier must start at range.min');
  for (let i = 1; i < tiers.length; i++) {
    if (!(tiers[i].min > tiers[i - 1].min)) throw new Error('reputation: tiers must be in ascending order of min');
  }
  for (const [actionId, { deltas }] of Object.entries(actions)) {
    for (const [faction, delta] of Object.entries(deltas)) {
      if (!ids.has(faction)) throw new Error(`reputation: action "${actionId}" uses unknown faction "${faction}"`);
      if (!Number.isInteger(delta)) throw new Error(`reputation: action "${actionId}" has a non-integer delta for "${faction}"`);
    }
  }
  if (authorityAttention && !ids.has(authorityAttention.faction)) {
    throw new Error(`reputation: authorityAttention uses unknown faction "${authorityAttention.faction}"`);
  }
  for (const option of config.npcMenu ?? []) {
    if (!actions[option.action]) throw new Error(`reputation: npcMenu uses unknown action "${option.action}"`);
  }
  return config;
}

/** Clamps a score to the configured range and rounds it to an integer. */
export function clampScore(score, range = REPUTATION_CONFIG.range) {
  return Math.min(range.max, Math.max(range.min, Math.round(score)));
}

/** The tier (from `tiers`, ascending by `min`) that `score` falls in. */
export function tierForScore(score, tiers = REPUTATION_CONFIG.tiers) {
  let tier = tiers[0];
  for (const t of tiers) if (score >= t.min) tier = t;
  return tier;
}

/**
 * Creates a reputation instance.
 *
 * - `config`: the reputation data (defaults to `src/data/reputation.json`).
 * - `storage`: an object with `getItem` / `setItem` (e.g. `localStorage`).
 *   When given, state is restored from it now and saved on every change.
 */
export function createReputation({ config = REPUTATION_CONFIG, storage = null, storageKey = STORAGE_KEY } = {}) {
  validateConfig(config);
  const { range, factions, tiers, actions } = config;
  const factionIds = factions.map((f) => f.id);
  const scores = new Map(factionIds.map((id) => [id, range.start]));
  const listeners = new Set();

  function requireFaction(faction) {
    if (!scores.has(faction)) throw new Error(`reputation: unknown faction "${faction}"`);
  }

  function requireTier(tierId) {
    const tier = tiers.find((t) => t.id === String(tierId).toLowerCase());
    if (!tier) throw new Error(`reputation: unknown tier "${tierId}"`);
    return tier;
  }

  function getReputation(faction) {
    requireFaction(faction);
    return scores.get(faction);
  }

  function getTierInfo(faction) {
    return tierForScore(getReputation(faction), tiers);
  }

  function getTier(faction) {
    return getTierInfo(faction).id;
  }

  function snapshot() {
    return Object.fromEntries(scores);
  }

  function save() {
    if (!storage) return;
    try {
      storage.setItem(storageKey, JSON.stringify({ version: SAVE_VERSION, scores: snapshot() }));
    } catch {
      // Storage full or disabled (e.g. private browsing): keep playing without saving.
    }
  }

  /** Restores saved scores. Unknown factions are ignored and new ones keep the start value. */
  function load() {
    if (!storage) return false;
    let saved;
    try {
      saved = JSON.parse(storage.getItem(storageKey));
    } catch {
      return false;
    }
    if (!saved || saved.version !== SAVE_VERSION || typeof saved.scores !== 'object' || !saved.scores) return false;
    for (const id of factionIds) {
      const value = saved.scores[id];
      if (typeof value === 'number' && Number.isFinite(value)) scores.set(id, clampScore(value, range));
    }
    return true;
  }

  function emit(event) {
    for (const listener of [...listeners]) listener(event);
  }

  /** Sets scores from a `{ faction: score }` map and reports what changed. */
  function setScores(next, actionId) {
    const changes = [];
    for (const [faction, value] of Object.entries(next)) {
      const previous = scores.get(faction);
      const score = clampScore(value, range);
      if (score === previous) continue;
      scores.set(faction, score);
      const previousTier = tierForScore(previous, tiers).id;
      const tier = tierForScore(score, tiers).id;
      changes.push({ faction, previous, score, delta: score - previous, previousTier, tier, tierChanged: tier !== previousTier });
    }
    if (changes.length) {
      save();
      emit({ actionId, changes });
    }
    return changes;
  }

  /**
   * Applies an action's per-faction deltas (clamped to the range). Returns
   * the changes that actually happened; listeners get `{ actionId, changes }`.
   */
  function applyAction(actionId) {
    const action = actions[actionId];
    if (!action) throw new Error(`reputation: unknown action "${actionId}"`);
    const next = {};
    for (const [faction, delta] of Object.entries(action.deltas)) next[faction] = scores.get(faction) + delta;
    return setScores(next, actionId);
  }

  /** Calls `listener({ actionId, changes })` whenever a score changes. Returns an unsubscribe function. */
  function onReputationChanged(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /** Price factor for trading with `faction` at its current tier (e.g. 0.8 when Honored, 1.5 when Hostile). */
  function getPriceMultiplier(faction) {
    return getTierInfo(faction).priceMultiplier ?? 1;
  }

  /** Whether members of `faction` will talk to the player (false when Hostile). */
  function willTalk(faction) {
    return getTierInfo(faction).willTalk !== false;
  }

  /** 0 (none) to 3 (high): how closely the authorities watch the player, from their score. */
  function getAuthorityAttention() {
    const attention = config.authorityAttention;
    if (!attention) return 0;
    const score = getReputation(attention.faction);
    return attention.thresholds.filter((threshold) => score <= threshold).length;
  }

  /** True when `requirement.faction` is at `requirement.minTier` or better. */
  function isUnlocked({ faction, minTier }) {
    return getTierInfo(faction).min >= requireTier(minTier).min;
  }

  /** Puts every faction back to the start value. */
  function reset() {
    return setScores(Object.fromEntries(factionIds.map((id) => [id, range.start])), null);
  }

  load();

  return Object.freeze({
    config,
    factions,
    tiers,
    actions,
    applyAction,
    getReputation,
    getTier,
    getTierInfo,
    onReputationChanged,
    getPriceMultiplier,
    willTalk,
    getAuthorityAttention,
    isUnlocked,
    snapshot,
    reset,
    save,
    load,
  });
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Accessing localStorage throws when storage is blocked.
    return null;
  }
}

let shared = null;

/** The shared, localStorage-backed instance used by the game (created on first use). */
export function getDefaultReputation() {
  shared ??= createReputation({ storage: browserStorage() });
  return shared;
}

export const applyAction = (actionId) => getDefaultReputation().applyAction(actionId);
export const getReputation = (faction) => getDefaultReputation().getReputation(faction);
export const getTier = (faction) => getDefaultReputation().getTier(faction);
export const onReputationChanged = (listener) => getDefaultReputation().onReputationChanged(listener);
export const getPriceMultiplier = (faction) => getDefaultReputation().getPriceMultiplier(faction);
export const willTalk = (faction) => getDefaultReputation().willTalk(faction);
export const getAuthorityAttention = () => getDefaultReputation().getAuthorityAttention();
export const isUnlocked = (requirement) => getDefaultReputation().isUnlocked(requirement);
