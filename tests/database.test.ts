import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { newState } from '../src/domain/model';
let db: PGlite;
const host = crypto.randomUUID(),
  player = crypto.randomUUID(),
  outsider = crypto.randomUUID();
let group: string;
let character: string;
async function as<T = Record<string, unknown>>(user: string, sql: string, args: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    return tx.query<T>(sql, args);
  });
}
beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create function auth.jwt() returns jsonb language sql stable as $$select '{"user_metadata":{"full_name":"Test adventurer"}}'::jsonb$$; grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;`,
  );
  await db.query('insert into auth.users values($1),($2),($3)', [host, player, outsider]);
  await db.exec(await readFile('supabase/migrations/001_companion.sql', 'utf8'));
  await db.exec(
    `create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$; create schema realtime; create table realtime.messages(extension text); alter table realtime.messages enable row level security; create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$; grant usage on schema storage,realtime to authenticated; grant select,insert,delete on storage.objects to authenticated; grant select,insert on realtime.messages to authenticated;`,
  );
  const storageSql = (
    await readFile('supabase/migrations/002_storage_realtime.sql', 'utf8')
  ).replace(
    'alter publication supabase_realtime add table public.characters,public.card_definitions;',
    '',
  );
  await db.exec(storageSql);
  await db.exec(await readFile('supabase/migrations/003_import.sql', 'utf8'));
  group = (await as<{ id: string }>(host, 'select create_group($1) id', ['Test table'])).rows[0].id;
  const token = (await as<{ token: string }>(host, 'select create_invite($1) token', [group]))
    .rows[0].token;
  await as(player, 'select join_group($1)', [token]);
  character = crypto.randomUUID();
  await as(player, 'select create_character($1,$2,$3)', [character, group, newState('Aria')]);
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe.sequential('Real PostgreSQL transactions and access control', () => {
  it('returns a complete RLS-filtered snapshot', async () => {
    const result = await as<{ data: { characters: unknown[] } }>(
      player,
      'select get_snapshot() data',
    );
    expect(result.rows[0].data.characters).toHaveLength(1);
    const hidden = await as<{ data: { characters: unknown[] } }>(
      outsider,
      'select get_snapshot() data',
    );
    expect(hidden.rows[0].data.characters).toHaveLength(0);
  });
  it('denies outsiders and direct writes', async () => {
    await expect(
      as(outsider, 'select apply_action($1,$2,0,$3,$4)', [
        crypto.randomUUID(),
        character,
        { kind: 'resource', key: 'wood', delta: 2 },
        'wood',
      ]),
    ).rejects.toThrow(/denied/);
    await expect(
      as(player, 'update characters set revision=999 where id=$1', [character]),
    ).rejects.toThrow(/permission denied/);
  });
  it('applies a resource award exactly once even if retried', async () => {
    const id = crypto.randomUUID();
    const args = [id, character, { kind: 'resource', key: 'wood', delta: 2 }, '+2 wood'];
    await as(player, 'select apply_action($1,$2,0,$3,$4)', args);
    await as(player, 'select apply_action($1,$2,0,$3,$4)', args);
    const r = await as<{ state: { resources: { wood: number } }; revision: number }>(
      player,
      'select state,revision from characters where id=$1',
      [character],
    );
    expect(r.rows[0].state.resources.wood).toBe(2);
    expect(r.rows[0].revision).toBe(1);
  });
  it('host can adjust without losing the player award; stale replacement conflicts', async () => {
    await as(host, 'select apply_action($1,$2,0,$3,$4)', [
      crypto.randomUUID(),
      character,
      { kind: 'resource', key: 'wood', delta: 1 },
      '+1 wood',
    ]);
    await expect(
      as(player, 'select apply_action($1,$2,0,$3,$4)', [
        crypto.randomUUID(),
        character,
        { kind: 'replace', state: newState('Old sheet') },
        'stale',
      ]),
    ).rejects.toThrow(/conflict/);
  });
  it('rejects fractional adjustments and invalid shape atomically', async () => {
    await expect(
      as(player, 'select apply_action($1,$2,2,$3,$4)', [
        crypto.randomUUID(),
        character,
        { kind: 'resource', key: 'wood', delta: 0.5 },
        'fraction',
      ]),
    ).rejects.toThrow(/Invalid/);
    await expect(
      as(player, 'select apply_action($1,$2,2,$3,$4)', [
        crypto.randomUUID(),
        character,
        { kind: 'replace', state: { name: 'Missing fields' } },
        'bad',
      ]),
    ).rejects.toThrow(/Invalid/);
  });
  it('undo appends history and refuses an older action', async () => {
    const a = (
      await as<{ id: string }>(
        player,
        'select id from actions where character_id=$1 and revision=2',
        [character],
      )
    ).rows[0].id;
    await as(player, 'select apply_action($1,$2,2,$3,$4)', [
      crypto.randomUUID(),
      character,
      { kind: 'undo', actionId: a },
      'Undo',
    ]);
    await expect(
      as(player, 'select apply_action($1,$2,3,$3,$4)', [
        crypto.randomUUID(),
        character,
        { kind: 'undo', actionId: a },
        'Undo again',
      ]),
    ).rejects.toThrow(/unavailable/);
    expect((await as<{ n: number }>(player, 'select count(*)::int n from actions')).rows[0].n).toBe(
      3,
    );
  });
  it('creates group session snapshots and rejects non-host finish', async () => {
    await expect(as(player, 'select finish_session($1)', [group])).rejects.toThrow(/denied/);
    await as(host, 'select finish_session($1)', [group]);
    expect(
      (
        await as<{ n: number }>(
          player,
          "select count(*)::int n from checkpoints where kind='session'",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('rolls back a whole import when any entry is malformed', async () => {
    const entries = [
      { id: crypto.randomUUID(), state: newState('Valid') },
      { id: crypto.randomUUID(), state: { name: 'Invalid' } },
    ];
    await expect(
      as(host, 'select import_bundle($1,$2,$3,null,0,$4)', [
        group,
        [],
        entries,
        crypto.randomUUID(),
      ]),
    ).rejects.toThrow(/Invalid/);
    expect(
      (await as<{ n: number }>(host, 'select count(*)::int n from characters')).rows[0].n,
    ).toBe(1);
  });
  it('archives campaigns without resetting character state', async () => {
    await as(host, "select manage_campaign($1,'Vampyre Slayer',null)", [group]);
    const id = (await as<{ id: string }>(host, 'select id from campaigns')).rows[0].id;
    await as(player, 'select assign_campaign($1,$2)', [character, id]);
    await as(host, "select manage_campaign($1,'',$2)", [group, id]);
    const r = (
      await as<{ campaign_id: string | null; state: { resources: { wood: number } } }>(
        player,
        'select campaign_id,state from characters where id=$1',
        [character],
      )
    ).rows[0];
    expect(r.campaign_id).toBeNull();
    expect(r.state.resources.wood).toBe(2);
  });
  it('revoked invitations cannot be used', async () => {
    const token = (await as<{ token: string }>(host, 'select create_invite($1) token', [group]))
      .rows[0].token;
    const id = (
      await db.query<{ id: string }>('select id from invitations where token=$1', [token])
    ).rows[0].id;
    await as(host, 'select revoke_invite($1)', [id]);
    await expect(as(outsider, 'select join_group($1)', [token])).rejects.toThrow(/unavailable/);
  });
  it('protects portrait metadata with the actual storage policies', async () => {
    const path = `${character}/${crypto.randomUUID()}.webp`;
    await as(player, "insert into storage.objects(bucket_id,name) values('portraits',$1)", [path]);
    expect((await as(host, 'select * from storage.objects')).rows).toHaveLength(1);
    expect((await as(outsider, 'select * from storage.objects')).rows).toHaveLength(0);
    await expect(
      as(outsider, "insert into storage.objects(bucket_id,name) values('portraits',$1)", [path]),
    ).rejects.toThrow(/row-level security/);
  });
});
