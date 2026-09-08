import { emptyCache, newState, previewOperation, stateSchema } from '../domain/model';
import type { Cache, Character, Operation, Pending, Card, State } from '../domain/model';
import { readCache, writeCache } from './storage';
import { rpc, supabase } from './client';

export const LOCAL_ID = '00000000-0000-4000-8000-000000000001';
export class Engine {
  cache: Cache = emptyCache();
  error = '';
  syncing = false;
  peers: { name: string; pending: number }[] = [];
  private chain = Promise.resolve();
  private listeners = new Set<() => void>();
  private stopped = false;
  private pumping = false;
  private channel?: ReturnType<NonNullable<typeof supabase>['channel']>;
  private interval?: ReturnType<typeof setInterval>;
  private watchedGroup = '';
  constructor(
    public account: string,
    public displayName: string,
    public local: boolean,
  ) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  emit() {
    this.listeners.forEach((fn) => fn());
  }
  async init() {
    this.cache = (await readCache(this.account)) || emptyCache();
    if (this.stopped) return;
    if (this.local && !this.cache.groups.length) {
      const id = crypto.randomUUID();
      this.cache.groups.push({ id, host_id: this.account, name: 'The evening adventurers' });
      this.cache.members.push({
        group_id: id,
        user_id: this.account,
        display_name: this.displayName,
      });
      await writeCache(this.account, this.cache);
    }
    this.emit();
    if (!this.local) {
      await this.refresh();
      this.startRealtime();
    }
    if (this.stopped) return;
    window.addEventListener('online', this.reconnect);
    this.interval = setInterval(this.reconnect, 30000);
    void this.pump();
  }
  reconnect = () => {
    if (!this.stopped && navigator.onLine && !this.local)
      void this.refresh().then(() => this.pump());
  };
  stop() {
    this.stopped = true;
    window.removeEventListener('online', this.reconnect);
    clearInterval(this.interval);
    if (this.channel) void supabase?.removeChannel(this.channel);
  }
  private async commit(fn: () => void) {
    const task = this.chain.then(async () => {
      const before = structuredClone(this.cache);
      try {
        fn();
        await writeCache(this.account, this.cache);
      } catch (e) {
        this.cache = before;
        throw e;
      }
      this.emit();
      this.track();
    });
    this.chain = task.catch(() => {});
    return task;
  }
  private track() {
    void this.channel?.track({ name: this.displayName, pending: this.cache.pending.length });
  }
  watchGroup(groupId: string) {
    if (groupId && groupId !== this.watchedGroup) this.startRealtime(groupId);
  }
  private startRealtime(groupId?: string) {
    if (!supabase || this.stopped) return;
    if (this.channel) void supabase.removeChannel(this.channel);
    const group = this.cache.groups.find((g) => g.id === groupId) || this.cache.groups[0];
    if (!group) return;
    this.watchedGroup = group.id;
    this.peers = [];
    this.channel = supabase
      .channel(`group:${group.id}`, {
        config: { private: true, presence: { key: this.account + ':' + crypto.randomUUID() } },
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters' }, () => {
        void this.refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'card_definitions' }, () => {
        void this.refresh();
      })
      .on('presence', { event: 'sync' }, () => {
        this.peers = Object.values(this.channel!.presenceState())
          .flat()
          .map((p) => {
            const v = p as unknown as { name: string; pending: number };
            return { name: v.name, pending: v.pending || 0 };
          });
        this.emit();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.track();
          void this.refresh().then(() => this.pump());
        }
      });
  }
  async refresh() {
    if (this.local || this.stopped || !navigator.onLine) return;
    try {
      const snapshot = await rpc<Cache>('get_snapshot');
      await this.commit(() => {
        const acknowledged = new Set(snapshot.actions.map((a) => a.id));
        const pending = this.cache.pending.filter((p) => !acknowledged.has(p.id));
        snapshot.characters = snapshot.characters.map((c) => {
          const current = this.cache.characters.find((x) => x.id === c.id);
          return current && current.revision > c.revision ? current : c;
        });
        this.cache = { ...snapshot, pending };
        this.error = '';
      });
    } catch (e) {
      this.error = (e as Error).message;
      this.emit();
    }
  }
  projected(character: Character): Character {
    let c = { ...structuredClone(character), state: stateSchema.parse(character.state) };
    for (const p of this.cache.pending.filter((p) => p.characterId === c.id)) {
      if (p.error) break;
      try {
        c = { ...c, state: previewOperation(this.cache, c, p.operation), revision: c.revision + 1 };
      } catch {
        break;
      }
    }
    return c;
  }
  canEdit(c: Character) {
    return (
      c.owner_id === this.account ||
      this.cache.groups.some((g) => g.id === c.group_id && g.host_id === this.account)
    );
  }
  async enqueue(character: Character, operation: Operation, label: string) {
    await this.commit(() => {
      const base = this.cache.characters.find((c) => c.id === character.id);
      if (!base || !this.canEdit(base)) throw Error('You do not have editing access.');
      if (this.cache.pending.some((p) => p.characterId === base.id && p.error))
        throw Error('Resolve the pending conflict first.');
      const projected = this.projected(base);
      if (!['resource', 'xp'].includes(operation.kind) && character.revision !== projected.revision)
        throw Error('This sheet changed. Reopen the editor to use its latest values.');
      previewOperation(this.cache, projected, operation);
      this.cache.pending.push({
        id: crypto.randomUUID(),
        characterId: base.id,
        expectedRevision: projected.revision,
        operation,
        label,
        createdAt: new Date().toISOString(),
      });
    });
    void this.pump();
  }
  async discard(id: string) {
    await this.commit(() => {
      const p = this.cache.pending.find((x) => x.id === id);
      if (!p) return;
      const idx = this.cache.pending.indexOf(p);
      // Dependent edits cannot be replayed safely after a discarded action.
      this.cache.pending = this.cache.pending.filter(
        (x, i) => i < idx || x.characterId !== p.characterId,
      );
    });
    void this.pump();
  }
  async pump() {
    if (this.pumping || this.stopped) return;
    this.pumping = true;
    this.syncing = true;
    this.emit();
    try {
      while (!this.stopped) {
        const blocked = new Set(
          this.cache.pending.filter((x) => x.error).map((x) => x.characterId),
        );
        const p = this.cache.pending.find((x) => !blocked.has(x.characterId));
        if (!p || (!this.local && !navigator.onLine)) break;
        try {
          if (this.local) await this.commit(() => this.applyLocal(p));
          else {
            await rpc('apply_action', {
              p_id: p.id,
              p_character: p.characterId,
              p_expected: p.expectedRevision,
              p_operation: p.operation,
              p_label: p.label,
            });
            // Keep the queue until authoritative state includes the action (crash-safe).
            await this.refresh();
            if (this.cache.pending.some((x) => x.id === p.id)) break;
          }
        } catch (e) {
          const message = (e as Error).message;
          if (
            /conflict|invalid|denied|negative|unavailable|newer|permission|limit|constraint/i.test(
              message,
            )
          )
            await this.commit(() => {
              const item = this.cache.pending.find((x) => x.id === p.id);
              if (item) item.error = message;
            });
          else {
            this.error = message;
            break;
          }
        }
      }
    } finally {
      this.pumping = false;
      this.syncing = false;
      this.emit();
      this.track();
    }
  }
  private checkpoint(
    c: Character,
    kind: 'automatic' | 'session' | 'recovery',
    session: string | null = null,
  ) {
    this.cache.checkpoints.unshift({
      id: crypto.randomUUID(),
      character_id: c.id,
      group_id: c.group_id,
      session_id: session,
      kind,
      state: structuredClone(c.state),
      revision: c.revision,
      created_at: new Date().toISOString(),
    });
    const old = this.cache.checkpoints
      .filter((x) => x.character_id === c.id && x.kind === 'automatic')
      .slice(100)
      .map((x) => x.id);
    this.cache.checkpoints = this.cache.checkpoints.filter((x) => !old.includes(x.id));
  }
  private applyLocal(p: Pending) {
    const c = this.cache.characters.find((c) => c.id === p.characterId)!;
    if (!['resource', 'xp'].includes(p.operation.kind) && c.revision !== p.expectedRevision)
      throw Error('Conflict: newer changes exist.');
    const state = previewOperation(this.cache, c, p.operation);
    if (p.operation.kind === 'replace' || p.operation.kind === 'restore')
      this.checkpoint(c, 'recovery');
    const before = structuredClone(c.state);
    c.state = state;
    c.revision++;
    c.updated_at = new Date().toISOString();
    this.cache.actions.unshift({
      id: p.id,
      character_id: c.id,
      actor_id: this.account,
      actor_name: this.displayName,
      label: p.label,
      before_state: before,
      after_state: state,
      revision: c.revision,
      created_at: c.updated_at,
    });
    const latest = this.cache.checkpoints.find(
      (x) => x.character_id === c.id && x.kind === 'automatic',
    );
    if (!latest || Date.now() - Date.parse(latest.created_at) >= 600000)
      this.checkpoint(c, 'automatic');
    this.cache.pending = this.cache.pending.filter((x) => x.id !== p.id);
  }
  async createCharacter(groupId: string, name: string, state?: State) {
    const id = crypto.randomUUID();
    if (this.local)
      await this.commit(() => {
        this.cache.characters.push({
          id,
          owner_id: this.account,
          group_id: groupId,
          campaign_id: null,
          state: state || newState(name),
          revision: 0,
          portrait_path: null,
          updated_at: new Date().toISOString(),
        });
      });
    else {
      await rpc('create_character', {
        p_id: id,
        p_group: groupId,
        p_state: state || newState(name),
      });
      await this.refresh();
    }
    return id;
  }
  async createGroup(name: string) {
    if (this.local)
      await this.commit(() => {
        const id = crypto.randomUUID();
        this.cache.groups.push({ id, name, host_id: this.account });
        this.cache.members.push({
          group_id: id,
          user_id: this.account,
          display_name: this.displayName,
        });
      });
    else {
      await rpc('create_group', { p_name: name });
      await this.refresh();
      this.startRealtime();
    }
  }
  async join(token: string) {
    await rpc('join_group', { p_token: token });
    await this.refresh();
    this.startRealtime();
  }
  async invite(group: string): Promise<string> {
    const token = await rpc<string>('create_invite', { p_group: group });
    await this.refresh();
    return token;
  }
  async revoke(id: string) {
    await rpc('revoke_invite', { p_id: id });
    await this.refresh();
  }
  async saveCard(card: Card) {
    if (this.local)
      await this.commit(() => {
        const old = this.cache.cards.find((x) => x.id === card.id);
        if (old && old.revision !== card.revision) throw Error('Card revision conflict');
        this.cache.cards = this.cache.cards.filter((x) => x.id !== card.id);
        this.cache.cards.push({ ...card, revision: old ? old.revision + 1 : 1 });
      });
    else {
      await rpc('save_card', { p_card: card });
      await this.refresh();
    }
  }
  async finish(group: string) {
    if (this.cache.pending.length)
      throw Error('Wait for your changes to save before finishing the session.');
    if (this.local)
      await this.commit(() => {
        const session = crypto.randomUUID();
        for (const c of this.cache.characters.filter((c) => c.group_id === group))
          this.checkpoint(c, 'session', session);
      });
    else {
      await rpc('finish_session', { p_group: group });
      await this.refresh();
    }
  }
  async deleteCheckpoint(id: string) {
    if (this.local)
      await this.commit(() => {
        this.cache.checkpoints = this.cache.checkpoints.filter((c) => c.id !== id);
      });
    else {
      await rpc('delete_checkpoint', { p_id: id });
      await this.refresh();
    }
  }
  async campaign(group: string, name: string, id?: string) {
    if (this.local)
      await this.commit(() => {
        if (id) {
          this.cache.campaigns.find((c) => c.id === id)!.status = 'archived';
          this.cache.characters
            .filter((c) => c.campaign_id === id)
            .forEach((c) => {
              c.campaign_id = null;
            });
        } else
          this.cache.campaigns.push({
            id: crypto.randomUUID(),
            group_id: group,
            name,
            status: 'active',
          });
      });
    else {
      await rpc('manage_campaign', { p_group: group, p_name: name, p_id: id || null });
      await this.refresh();
    }
  }
  async assign(c: Character, campaign: string | null) {
    if (this.local)
      await this.commit(() => {
        this.cache.characters.find((x) => x.id === c.id)!.campaign_id = campaign;
      });
    else {
      await rpc('assign_campaign', { p_character: c.id, p_campaign: campaign });
      await this.refresh();
    }
  }
  async portrait(c: Character, path: string | null) {
    if (this.local)
      await this.commit(() => {
        this.cache.characters.find((x) => x.id === c.id)!.portrait_path = path;
      });
    else {
      await rpc('set_portrait', { p_character: c.id, p_path: path });
      await this.refresh();
    }
  }
  async importLocal(
    groupId: string,
    entries: { id: string; state: State }[],
    cards: Card[],
    replace?: Character,
  ) {
    await this.commit(() => {
      if (replace) {
        const current = this.cache.characters.find((c) => c.id === replace.id);
        if (!current || current.revision !== replace.revision)
          throw Error('Import revision conflict');
      }
      this.cache.cards.push(...cards);
      for (const entry of entries) {
        if (replace)
          this.applyLocal({
            id: crypto.randomUUID(),
            characterId: replace.id,
            expectedRevision: replace.revision,
            operation: { kind: 'replace', state: entry.state },
            label: 'Imported backup over character',
            createdAt: new Date().toISOString(),
          });
        else
          this.cache.characters.push({
            id: entry.id,
            owner_id: this.account,
            group_id: groupId,
            campaign_id: null,
            state: entry.state,
            revision: 0,
            portrait_path: null,
            updated_at: new Date().toISOString(),
          });
      }
    });
  }
}
