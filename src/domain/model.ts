import { z } from 'zod';

export const skills = [
  'attack',
  'ranged',
  'magic',
  'defence',
  'thieving',
  'gathering',
  'crafting',
  'cooking',
] as const;
export const resources = [
  'coins',
  'wood',
  'ore',
  'hide',
  'flax',
  'herbs',
  'rawFish',
  'food',
] as const;
export const labels: Record<string, string> = {
  attack: 'Attack / Melee',
  ranged: 'Ranged',
  magic: 'Magic',
  defence: 'Defence',
  thieving: 'Thieving',
  gathering: 'Gathering',
  crafting: 'Crafting',
  cooking: 'Cooking',
  coins: 'Gold pieces',
  wood: 'Wood',
  ore: 'Ore',
  hide: 'Hide',
  flax: 'Flax',
  herbs: 'Herbs',
  rawFish: 'Raw fish',
  food: 'Food',
};
export const RULESET = 'elvarg-provisional-v1';
const count = z.number().int().min(0).max(999999);
export const skillSchema = z.object({ level: z.number().int().min(1).max(99), xp: count }).strict();
export const heldSchema = z
  .object({
    id: z.string().uuid(),
    definitionId: z.string().uuid(),
    quantity: z.number().int().min(1).max(999),
    equipped: z.boolean(),
    notes: z.string().max(4000),
  })
  .strict();
export const stateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    notes: z.string().max(10000),
    skills: z
      .object(
        Object.fromEntries(skills.map((k) => [k, skillSchema])) as Record<
          (typeof skills)[number],
          typeof skillSchema
        >,
      )
      .strict(),
    resources: z
      .record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/), count)
      .refine((r) => Object.keys(r).length <= 50),
    wounds: count,
    deaths: count,
    sideQuests: count,
    hitpoints: count,
    capeNotes: z.string().max(4000),
    cards: z.array(heldSchema).max(500),
    autoLevel: z.boolean(),
    ruleset: z.literal(RULESET),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (
      s.autoLevel &&
      skills.some((k) => s.skills[k].xp > 2 || (s.skills[k].level === 99 && s.skills[k].xp !== 0))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Automatic progression requires XP from 0 to 2, or 0 at level 99.',
      });
    if (new Set(s.cards.map((c) => c.id)).size !== s.cards.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate held card IDs' });
  });
export type State = z.infer<typeof stateSchema>;
export const cardSchema = z
  .object({
    id: z.string().uuid(),
    group_id: z.string().uuid(),
    revision: z.number().int().positive(),
    name: z.string().trim().min(1).max(100),
    kind: z.enum(['weapon', 'armour', 'accessory', 'cape', 'recipe', 'quest', 'other']),
    effects: z.string().max(10000),
    requirements: z.string().max(4000),
  })
  .strict();
export type Card = z.infer<typeof cardSchema>;
export type Character = {
  id: string;
  owner_id: string;
  group_id: string;
  campaign_id: string | null;
  state: State;
  revision: number;
  portrait_path: string | null;
  updated_at: string;
};
export type Group = { id: string; name: string; host_id: string };
export type Campaign = {
  id: string;
  group_id: string;
  name: string;
  status: 'active' | 'archived';
};
export type Member = { group_id: string; user_id: string; display_name: string };
export type Invitation = { id: string; group_id: string; expires_at: string; revoked: boolean };
export type Action = {
  id: string;
  character_id: string;
  actor_id: string;
  actor_name: string;
  label: string;
  before_state: State;
  after_state: State;
  revision: number;
  created_at: string;
};
export type Checkpoint = {
  id: string;
  character_id: string;
  group_id: string;
  session_id: string | null;
  kind: 'automatic' | 'session' | 'recovery';
  state: State;
  revision: number;
  created_at: string;
};
export type Operation =
  | { kind: 'resource'; key: string; delta: number }
  | { kind: 'xp'; key: (typeof skills)[number]; delta: number }
  | { kind: 'replace'; state: State }
  | { kind: 'undo'; actionId: string }
  | { kind: 'restore'; checkpointId: string };
export type Pending = {
  id: string;
  characterId: string;
  expectedRevision: number;
  operation: Operation;
  label: string;
  createdAt: string;
  error?: string;
};
export type Cache = {
  groups: Group[];
  members: Member[];
  campaigns: Campaign[];
  characters: Character[];
  cards: Card[];
  actions: Action[];
  checkpoints: Checkpoint[];
  invitations: Invitation[];
  pending: Pending[];
};
export const emptyCache = (): Cache => ({
  groups: [],
  members: [],
  campaigns: [],
  characters: [],
  cards: [],
  actions: [],
  checkpoints: [],
  invitations: [],
  pending: [],
});
export function newState(name: string): State {
  return stateSchema.parse({
    name,
    notes: '',
    skills: Object.fromEntries(skills.map((k) => [k, { level: 1, xp: 0 }])),
    resources: { coins: 0, wood: 0 },
    wounds: 0,
    deaths: 0,
    sideQuests: 0,
    hitpoints: 0,
    capeNotes: '',
    cards: [],
    autoLevel: false,
    ruleset: RULESET,
  });
}
export function applyOperation(state: State, operation: Operation): State {
  const s = structuredClone(state);
  if (operation.kind === 'replace') return stateSchema.parse(operation.state);
  if (operation.kind === 'resource') {
    if (
      !/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(operation.key) ||
      !Number.isSafeInteger(operation.delta)
    )
      throw Error('Invalid resource adjustment');
    s.resources[operation.key] = (s.resources[operation.key] || 0) + operation.delta;
  } else if (operation.kind === 'xp') {
    if (!skills.includes(operation.key) || !Number.isSafeInteger(operation.delta))
      throw Error('Invalid XP adjustment');
    const skill = s.skills[operation.key];
    const total = skill.xp + operation.delta;
    if (total < 0) throw Error('XP cannot be negative. Use a correction to change levels.');
    if (s.autoLevel) {
      skill.level = Math.min(99, skill.level + Math.floor(total / 3));
      skill.xp = skill.level === 99 ? 0 : total % 3;
    } else skill.xp = total;
  } else throw Error('Recovery requires authoritative history');
  return stateSchema.parse(s);
}
export function previewOperation(cache: Cache, character: Character, operation: Operation): State {
  if (operation.kind === 'undo') {
    const a = cache.actions.find(
      (a) => a.id === operation.actionId && a.character_id === character.id,
    );
    if (!a || a.revision !== character.revision)
      throw Error('This action has newer changes. Use a correction instead.');
    return a.before_state;
  }
  if (operation.kind === 'restore') {
    const cp = cache.checkpoints.find(
      (c) => c.id === operation.checkpointId && c.character_id === character.id,
    );
    if (!cp) throw Error('Checkpoint is unavailable');
    return cp.state;
  }
  return applyOperation(character.state, operation);
}
