import { describe, expect, it } from 'vitest';
import { applyOperation, newState, stateSchema } from '../src/domain/model';
import { backupSchema, makeBackup } from '../src/data/backup';
import { emptyCache } from '../src/domain/model';
describe('Character rules and backups', () => {
  it('fills missing standard resources without changing saved or custom quantities', () => {
    const state = newState('Aria');
    expect(Object.keys(state.resources)).toHaveLength(11);
    expect(state.resources).not.toHaveProperty('flax');
    const restored = stateSchema.parse({ ...state, resources: { wood: 7, flax: 3, crystal: 9 } });
    expect(restored.resources).toMatchObject({ wood: 7, ore: 0, cherries: 0, flax: 3, crystal: 9 });
    expect(stateSchema.parse(restored)).toEqual(restored);
  });
  it('awards resources without counting token faces', () => {
    const s = applyOperation(newState('Aria'), { kind: 'resource', key: 'wood', delta: 2 });
    expect(s.resources.wood).toBe(2);
  });
  it('rolls the third XP into a level by default', () => {
    const s = newState('Aria');
    s.skills.attack.xp = 2;
    expect(applyOperation(s, { kind: 'xp', key: 'attack', delta: 1 }).skills.attack).toEqual({
      level: 2,
      xp: 0,
    });
  });
  it('levels with remainder and caps at 99 after confirmation', () => {
    const s = newState('Aria');
    s.autoLevel = true;
    s.skills.attack.xp = 2;
    expect(applyOperation(s, { kind: 'xp', key: 'attack', delta: 5 }).skills.attack).toEqual({
      level: 3,
      xp: 1,
    });
    s.skills.attack.level = 98;
    expect(applyOperation(s, { kind: 'xp', key: 'attack', delta: 100 }).skills.attack).toEqual({
      level: 99,
      xp: 0,
    });
  });
  it('rejects negative, fractional and malformed values', () => {
    expect(() =>
      applyOperation(newState('Aria'), { kind: 'resource', key: 'wood', delta: -1 }),
    ).toThrow();
    expect(() =>
      applyOperation(newState('Aria'), { kind: 'resource', key: 'wood', delta: 0.5 }),
    ).toThrow();
    expect(() => stateSchema.parse({ ...newState('Aria'), name: '' })).toThrow();
  });
  it('round-trips a versioned export and rejects future or corrupt formats', () => {
    const c = {
      id: crypto.randomUUID(),
      owner_id: crypto.randomUUID(),
      group_id: crypto.randomUUID(),
      campaign_id: null,
      state: newState('Aria'),
      revision: 0,
      portrait_path: null,
      updated_at: new Date().toISOString(),
    };
    const backup = makeBackup(emptyCache(), [c]);
    expect(backupSchema.parse(JSON.parse(JSON.stringify(backup))).characters[0].state).toEqual(
      c.state,
    );
    expect(() => backupSchema.parse({ ...backup, version: 9 })).toThrow();
  });
  it('rejects missing and duplicate card references', () => {
    const c = {
      id: crypto.randomUUID(),
      owner_id: crypto.randomUUID(),
      group_id: crypto.randomUUID(),
      campaign_id: null,
      state: newState('Aria'),
      revision: 0,
      portrait_path: null,
      updated_at: new Date().toISOString(),
    };
    c.state.cards.push({
      id: crypto.randomUUID(),
      definitionId: crypto.randomUUID(),
      quantity: 1,
      equipped: false,
      notes: '',
    });
    expect(() => makeBackup(emptyCache(), [c])).toThrow();
  });
});

it('converts legacy manual XP without double leveling on reload', () => {
  const s = newState('Legacy');
  s.autoLevel = false;
  s.skills.attack = { level: 4, xp: 8 };
  const upgraded = stateSchema.parse(s);
  expect(upgraded.skills.attack).toEqual({ level: 6, xp: 2 });
  expect(stateSchema.parse(upgraded)).toEqual(upgraded);
});
