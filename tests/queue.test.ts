import 'fake-indexeddb/auto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { emptyCache, newState, applyOperation } from '../src/domain/model';
import type { Cache, Operation } from '../src/domain/model';
import { writeCache, readCache } from '../src/data/storage';
const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('../src/data/client', () => ({ supabase: null, rpc: mockRpc }));
import { Engine } from '../src/data/engine';
let engines: Engine[] = [];
let account: string;
let server: Cache;
let characterId: string;
beforeEach(async () => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: false });
  account = crypto.randomUUID();
  characterId = crypto.randomUUID();
  server = emptyCache();
  const groupId = crypto.randomUUID();
  server.groups.push({ id: groupId, host_id: account, name: 'Table' });
  server.characters.push({
    id: characterId,
    group_id: groupId,
    owner_id: account,
    campaign_id: null,
    state: newState('Aria'),
    revision: 0,
    portrait_path: null,
    updated_at: new Date().toISOString(),
  });
  await writeCache(account, server);
  mockRpc.mockReset();
  mockRpc.mockImplementation(
    async (name: string, args?: { p_id: string; p_operation: Operation }) => {
      if (name === 'get_snapshot') return structuredClone(server);
      if (name === 'apply_action') {
        const c = server.characters[0];
        if (server.actions.some((a) => a.id === args!.p_id)) return c.revision;
        const before = structuredClone(c.state);
        c.state = applyOperation(c.state, args!.p_operation);
        c.revision++;
        server.actions.unshift({
          id: args!.p_id,
          character_id: c.id,
          actor_id: account,
          actor_name: 'Aria',
          label: 'Award',
          before_state: before,
          after_state: c.state,
          revision: c.revision,
          created_at: new Date().toISOString(),
        });
        return c.revision;
      }
    },
  );
});
afterEach(() => {
  engines.forEach((e) => e.stop());
  engines = [];
  vi.unstubAllGlobals();
});
async function start() {
  const e = new Engine(account, 'Aria', false);
  engines.push(e);
  await e.init();
  return e;
}
it('persists offline operations across restart and synchronizes exactly once', async () => {
  const first = await start();
  await first.enqueue(
    first.cache.characters[0],
    { kind: 'resource', key: 'wood', delta: 2 },
    '+2 wood',
  );
  expect((await readCache(account))!.pending).toHaveLength(1);
  expect(first.projected(first.cache.characters[0]).state.resources.wood).toBe(2);
  first.stop();
  const next = await start();
  expect(next.cache.pending).toHaveLength(1);
  expect(next.projected(next.cache.characters[0]).state.resources.wood).toBe(2);
  vi.stubGlobal('navigator', { onLine: true });
  await next.pump();
  expect(next.cache.pending).toHaveLength(0);
  expect(next.cache.characters[0].state.resources.wood).toBe(2);
  await next.pump();
  expect(server.characters[0].revision).toBe(1);
});
it('does not leak the local cache into another account', async () => {
  expect(await readCache(crypto.randomUUID())).toBeUndefined();
});
it('reconciles an action acknowledged before a client crash without doubling it', async () => {
  const e = await start();
  await e.enqueue(e.cache.characters[0], { kind: 'resource', key: 'wood', delta: 2 }, '+2 wood');
  const p = e.cache.pending[0];
  await mockRpc('apply_action', { p_id: p.id, p_operation: p.operation });
  e.stop();
  vi.stubGlobal('navigator', { onLine: true });
  const recovered = await start();
  expect(recovered.cache.pending).toHaveLength(0);
  expect(recovered.cache.characters[0].state.resources.wood).toBe(2);
});
it('preserves a rejected change for review', async () => {
  const e = await start();
  await e.enqueue(
    e.cache.characters[0],
    { kind: 'replace', state: newState('Correction') },
    'Correct',
  );
  mockRpc.mockRejectedValue(Error('Revision conflict'));
  vi.stubGlobal('navigator', { onLine: true });
  await e.pump();
  expect(e.cache.pending[0].error).toMatch(/conflict/);
  expect((await readCache(account))!.pending).toHaveLength(1);
});
