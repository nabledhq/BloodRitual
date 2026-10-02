import { describe, it, expect, vi } from 'vitest';
import {
  REPUTATION_CONFIG,
  STORAGE_KEY,
  createReputation,
  clampScore,
  tierForScore,
  validateConfig,
} from '../src/reputation.js';

/** In-memory stand-in for localStorage. */
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

/** A small config with one action that pushes a single faction by `delta`. */
function configWith(actions, extra = {}) {
  return { ...REPUTATION_CONFIG, actions: { ...REPUTATION_CONFIG.actions, ...actions }, ...extra };
}

function applyTimes(rep, actionId, n) {
  for (let i = 0; i < n; i++) rep.applyAction(actionId);
}

describe('reputation data', () => {
  it('defines the five factions', () => {
    expect(REPUTATION_CONFIG.factions.map((f) => f.id)).toEqual([
      'seminole_families',
      'traders',
      'farmers',
      'authorities',
      'nearby_town',
    ]);
  });

  it('covers the required actions', () => {
    for (const id of [
      'help_family_food',
      'help_family_protection',
      'keep_promise',
      'break_promise',
      'trade_fair',
      'trade_cheat',
      'respect_custom',
      'cooperate_authorities',
      'resist_authorities',
      'protect_land',
      'steal',
      'threaten_civilian',
      'harm_civilian',
      'share_secret_with_outsiders',
      'keep_community_secret',
    ]) {
      expect(REPUTATION_CONFIG.actions[id], id).toBeDefined();
    }
  });

  it('is valid', () => {
    expect(() => validateConfig(REPUTATION_CONFIG)).not.toThrow();
  });

  it('rejects actions that name unknown factions or non-integer deltas', () => {
    expect(() => validateConfig(configWith({ bad: { deltas: { pirates: 5 } } }))).toThrow(/unknown faction "pirates"/);
    expect(() => validateConfig(configWith({ bad: { deltas: { traders: 1.5 } } }))).toThrow(/non-integer/);
    expect(() => validateConfig({ ...REPUTATION_CONFIG, npcMenu: [{ label: 'x', action: 'nope' }] })).toThrow(/unknown action/);
  });

  it('needs only a config change to add a faction', () => {
    const config = {
      ...REPUTATION_CONFIG,
      factions: [...REPUTATION_CONFIG.factions, { id: 'cattlemen', label: 'Cattlemen' }],
      actions: { ...REPUTATION_CONFIG.actions, help_drive: { label: 'Help a cattle drive', deltas: { cattlemen: 15 } } },
    };
    const rep = createReputation({ config });
    expect(rep.getReputation('cattlemen')).toBe(0);
    rep.applyAction('help_drive');
    expect(rep.getReputation('cattlemen')).toBe(15);
    expect(rep.getTier('cattlemen')).toBe('neutral');
  });
});

describe('createReputation', () => {
  it('starts every faction at 0 and Neutral', () => {
    const rep = createReputation();
    for (const { id } of rep.factions) {
      expect(rep.getReputation(id)).toBe(0);
      expect(rep.getTier(id)).toBe('neutral');
    }
  });

  it('throws on unknown factions and actions', () => {
    const rep = createReputation();
    expect(() => rep.getReputation('pirates')).toThrow(/unknown faction/);
    expect(() => rep.applyAction('fly')).toThrow(/unknown action/);
  });

  it('clamps scores to -100..100', () => {
    const rep = createReputation({
      config: configWith({ up: { deltas: { traders: 70 } }, down: { deltas: { traders: -70 } } }),
    });
    rep.applyAction('up');
    rep.applyAction('up');
    expect(rep.getReputation('traders')).toBe(100);
    expect(rep.applyAction('up')).toEqual([]);
    expect(rep.getReputation('traders')).toBe(100);
    applyTimes(rep, 'down', 4);
    expect(rep.getReputation('traders')).toBe(-100);
    expect(clampScore(250)).toBe(100);
    expect(clampScore(-250)).toBe(-100);
    expect(clampScore(12.6)).toBe(13);
  });

  it('maps scores to tiers at the exact boundaries', () => {
    const cases = [
      [-100, 'hostile'],
      [-60, 'hostile'],
      [-59, 'distrusted'],
      [-20, 'distrusted'],
      [-19, 'neutral'],
      [0, 'neutral'],
      [19, 'neutral'],
      [20, 'trusted'],
      [59, 'trusted'],
      [60, 'honored'],
      [100, 'honored'],
    ];
    for (const [score, tier] of cases) expect(tierForScore(score).id, String(score)).toBe(tier);
    // And through the instance, one point at a time.
    const rep = createReputation({ config: configWith({ dn: { deltas: { farmers: -1 } }, up: { deltas: { farmers: 1 } } }) });
    applyTimes(rep, 'dn', 19);
    expect(rep.getTier('farmers')).toBe('neutral');
    rep.applyAction('dn');
    expect(rep.getTier('farmers')).toBe('distrusted');
    applyTimes(rep, 'dn', 39);
    expect(rep.getTier('farmers')).toBe('distrusted');
    rep.applyAction('dn');
    expect(rep.getReputation('farmers')).toBe(-60);
    expect(rep.getTier('farmers')).toBe('hostile');
    applyTimes(rep, 'up', 80);
    expect(rep.getTier('farmers')).toBe('trusted');
    applyTimes(rep, 'up', 39);
    expect(rep.getTier('farmers')).toBe('trusted');
    rep.applyAction('up');
    expect(rep.getReputation('farmers')).toBe(60);
    expect(rep.getTier('farmers')).toBe('honored');
  });

  it('applies one action to several factions at once', () => {
    const rep = createReputation();
    const changes = rep.applyAction('steal');
    const { deltas } = REPUTATION_CONFIG.actions.steal;
    expect(Object.keys(deltas).length).toBeGreaterThan(1);
    expect(changes.map((c) => c.faction).sort()).toEqual(Object.keys(deltas).sort());
    for (const [faction, delta] of Object.entries(deltas)) expect(rep.getReputation(faction)).toBe(delta);
    // Factions the action does not mention are untouched.
    for (const { id } of rep.factions) if (!(id in deltas)) expect(rep.getReputation(id)).toBe(0);
  });

  it('resist_authorities raises seminole_families and lowers authorities', () => {
    const rep = createReputation();
    rep.applyAction('resist_authorities');
    expect(rep.getReputation('seminole_families')).toBeGreaterThan(0);
    expect(rep.getReputation('authorities')).toBeLessThan(0);
  });

  it('tells listeners what changed, including tier changes, until unsubscribed', () => {
    const rep = createReputation({ config: configWith({ big: { deltas: { traders: 25, farmers: -5 } } }) });
    const listener = vi.fn();
    const stop = rep.onReputationChanged(listener);
    rep.applyAction('big');
    expect(listener).toHaveBeenCalledTimes(1);
    const { actionId, changes } = listener.mock.calls[0][0];
    expect(actionId).toBe('big');
    expect(changes).toEqual([
      { faction: 'traders', previous: 0, score: 25, delta: 25, previousTier: 'neutral', tier: 'trusted', tierChanged: true },
      { faction: 'farmers', previous: 0, score: -5, delta: -5, previousTier: 'neutral', tier: 'neutral', tierChanged: false },
    ]);
    stop();
    rep.applyAction('big');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('gives a price multiplier per tier', () => {
    const rep = createReputation({ config: configWith({ up: { deltas: { traders: 20 } }, dn: { deltas: { traders: -20 } } }) });
    expect(rep.getPriceMultiplier('traders')).toBe(1);
    rep.applyAction('up');
    expect(rep.getPriceMultiplier('traders')).toBe(0.9);
    applyTimes(rep, 'up', 2);
    expect(rep.getTier('traders')).toBe('honored');
    expect(rep.getPriceMultiplier('traders')).toBe(0.8);
    applyTimes(rep, 'dn', 5);
    expect(rep.getTier('traders')).toBe('distrusted');
    expect(rep.getPriceMultiplier('traders')).toBe(1.2);
    rep.applyAction('dn');
    expect(rep.getTier('traders')).toBe('hostile');
    expect(rep.getPriceMultiplier('traders')).toBe(1.5);
  });

  it('will not talk at Hostile only', () => {
    const rep = createReputation({ config: configWith({ dn: { deltas: { nearby_town: -1 } } }) });
    expect(rep.willTalk('nearby_town')).toBe(true);
    applyTimes(rep, 'dn', 59);
    expect(rep.getTier('nearby_town')).toBe('distrusted');
    expect(rep.willTalk('nearby_town')).toBe(true);
    rep.applyAction('dn');
    expect(rep.willTalk('nearby_town')).toBe(false);
    expect(rep.willTalk('traders')).toBe(true);
  });

  it('derives authority attention (0-3) from the authorities score', () => {
    const rep = createReputation({ config: configWith({ dn: { deltas: { authorities: -1 } }, up: { deltas: { authorities: 50 } } }) });
    const at = (score) => {
      rep.reset();
      if (score > 0) rep.applyAction('up');
      applyTimes(rep, 'dn', Math.max(0, -score));
      return rep.getAuthorityAttention();
    };
    expect(at(50)).toBe(0);
    expect(at(0)).toBe(0);
    expect(at(-19)).toBe(0);
    expect(at(-20)).toBe(1);
    expect(at(-39)).toBe(1);
    expect(at(-40)).toBe(2);
    expect(at(-59)).toBe(2);
    expect(at(-60)).toBe(3);
    expect(at(-100)).toBe(3);
  });

  it('unlocks requirements at the minimum tier or better', () => {
    const rep = createReputation({ config: configWith({ up: { deltas: { farmers: 20 } }, dn: { deltas: { farmers: -20 } } }) });
    const trusted = { faction: 'farmers', minTier: 'trusted' };
    expect(rep.isUnlocked(trusted)).toBe(false);
    expect(rep.isUnlocked({ faction: 'farmers', minTier: 'neutral' })).toBe(true);
    expect(rep.isUnlocked({ faction: 'farmers', minTier: 'hostile' })).toBe(true);
    rep.applyAction('up');
    expect(rep.isUnlocked(trusted)).toBe(true);
    expect(rep.isUnlocked({ faction: 'farmers', minTier: 'Trusted' })).toBe(true);
    expect(rep.isUnlocked({ faction: 'farmers', minTier: 'honored' })).toBe(false);
    applyTimes(rep, 'up', 2);
    expect(rep.isUnlocked({ faction: 'farmers', minTier: 'honored' })).toBe(true);
    applyTimes(rep, 'dn', 3);
    expect(rep.isUnlocked(trusted)).toBe(false);
    expect(() => rep.isUnlocked({ faction: 'farmers', minTier: 'legendary' })).toThrow(/unknown tier/);
    expect(() => rep.isUnlocked({ faction: 'pirates', minTier: 'trusted' })).toThrow(/unknown faction/);
  });

  it('resets every faction to 0', () => {
    const rep = createReputation();
    rep.applyAction('harm_civilian');
    const listener = vi.fn();
    rep.onReputationChanged(listener);
    rep.reset();
    for (const { id } of rep.factions) expect(rep.getReputation(id)).toBe(0);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ actionId: null }));
  });
});

describe('saving and restoring', () => {
  it('saves every change and restores it in a new instance (a reload)', () => {
    const storage = memoryStorage();
    const first = createReputation({ storage });
    first.applyAction('resist_authorities');
    first.applyAction('trade_fair');
    expect(JSON.parse(storage.getItem(STORAGE_KEY))).toEqual({ version: 1, scores: first.snapshot() });

    const second = createReputation({ storage });
    expect(second.snapshot()).toEqual(first.snapshot());
    expect(second.getReputation('authorities')).toBeLessThan(0);
  });

  it('clamps saved scores, ignores unknown factions and starts new factions at 0', () => {
    const storage = memoryStorage({
      [STORAGE_KEY]: JSON.stringify({ version: 1, scores: { traders: 400, farmers: -42, pirates: 10, authorities: 'x' } }),
    });
    const rep = createReputation({ storage });
    expect(rep.getReputation('traders')).toBe(100);
    expect(rep.getReputation('farmers')).toBe(-42);
    expect(rep.getReputation('authorities')).toBe(0);
    expect(rep.getReputation('nearby_town')).toBe(0);
    expect(rep.snapshot()).not.toHaveProperty('pirates');
  });

  it('starts fresh when the save is missing, corrupt or from another version', () => {
    for (const saved of [undefined, 'not json', JSON.stringify({ version: 99, scores: { traders: 50 } }), 'null']) {
      const storage = memoryStorage(saved === undefined ? {} : { [STORAGE_KEY]: saved });
      const rep = createReputation({ storage });
      expect(rep.getReputation('traders')).toBe(0);
    }
  });

  it('keeps working when storage throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const rep = createReputation({ storage });
    expect(() => rep.applyAction('trade_fair')).not.toThrow();
    expect(rep.getReputation('traders')).toBe(REPUTATION_CONFIG.actions.trade_fair.deltas.traders);
  });
});

describe('module-level API', () => {
  it('works on a shared instance', async () => {
    vi.resetModules();
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    try {
      const mod = await import('../src/reputation.js');
      const listener = vi.fn();
      mod.onReputationChanged(listener);
      mod.applyAction('resist_authorities');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(mod.getReputation('seminole_families')).toBeGreaterThan(0);
      expect(mod.getReputation('authorities')).toBeLessThan(0);
      expect(mod.getTier('authorities')).toBe('neutral');
      expect(mod.getPriceMultiplier('authorities')).toBe(1);
      expect(mod.willTalk('authorities')).toBe(true);
      expect(mod.getAuthorityAttention()).toBe(0);
      expect(mod.isUnlocked({ faction: 'seminole_families', minTier: 'neutral' })).toBe(true);
      expect(mod.getDefaultReputation()).toBe(mod.getDefaultReputation());
      expect(storage.getItem(mod.STORAGE_KEY)).toContain('seminole_families');
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
