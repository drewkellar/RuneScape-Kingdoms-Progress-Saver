import { useEffect, useState } from 'react';
import {
  Plus,
  Pencil,
  ShieldCheck,
  ScrollText,
  Download,
  Printer,
  ImagePlus,
  Undo2,
  BookOpen,
  Archive,
} from 'lucide-react';
import { skills, labels } from '../domain/model';
import type { Character, State, Card } from '../domain/model';
import type { Engine } from '../data/engine';
import { getPortrait } from '../data/storage';
import { supabase } from '../data/client';
import Icon from './Icon';
import PaperSheet from './PaperSheet';
import { Counter, Empty, TextEditor } from './components';
export function Portrait({
  character,
  engine,
  large = false,
}: {
  character: Character;
  engine: Engine;
  large?: boolean;
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    let objectUrl = '';
    setUrl('');
    void (async () => {
      if (!character.portrait_path) return;
      let b = await getPortrait(engine.account, character.portrait_path);
      if (!engine.local && supabase) {
        const r = await supabase.storage.from('portraits').download(character.portrait_path);
        if (r.data) b = r.data;
      }
      if (b && alive) {
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      }
    })().catch(() => {});
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [character.portrait_path, engine, character.id]);
  return (
    <div className={`portrait ${large ? 'large' : ''}`}>
      {url ? (
        <img src={url} alt={`${character.state.name}'s portrait`} />
      ) : (
        <span>
          {character.state.name
            .split(' ')
            .map((x) => x[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()}
        </span>
      )}
    </div>
  );
}
type Props = {
  engine: Engine;
  character: Character;
  run: (fn: () => Promise<unknown>) => void;
  edit: (kind: string, data?: unknown) => void;
  download: () => void;
};
export default function Sheet({ engine, character: c, run, edit, download }: Props) {
  const [tab, setTab] = useState('inventory');
  const [search, setSearch] = useState('');
  const s = c.state;
  const canEdit = engine.canEdit(c);
  const latest = engine.cache.actions.find((a) => a.character_id === c.id);
  const change = (next: State, label: string) =>
    run(() => engine.enqueue(c, { kind: 'replace', state: next }, label));
  const updateCard = (id: string, patch: Partial<State['cards'][number]>) =>
    change(
      { ...s, cards: s.cards.map((x) => (x.id === id ? { ...x, ...patch } : x)) },
      'Updated held card',
    );
  const owner =
    engine.cache.members.find((m) => m.user_id === c.owner_id)?.display_name || 'Adventurer';
  const total = skills.reduce((n, k) => n + s.skills[k].level, 0);
  return (
    <>
      <div className="breadcrumb">
        YOUR ADVENTURE <span>/</span> CHARACTER SHEET
      </div>
      <div className="sheet-toolbar">
        <p>
          {owner} · Total level <b>{total}</b>
        </p>
        <div className="heading-actions">
          <button onClick={download}>
            <Download size={16} /> Download
          </button>
          <button
            className="icon-button"
            onClick={() => window.print()}
            aria-label="Print character"
          >
            <Printer size={17} />
          </button>
          {canEdit && (
            <button onClick={() => edit('correction')} aria-label="Correct character values">
              <Pencil size={16} /> Correct values
            </button>
          )}
        </div>
      </div>
      {!s.autoLevel && (
        <div className="notice compact">
          <BookOpen size={17} />
          <span>XP is tracked manually until you confirm your printed progression rules.</span>
          {canEdit && <button onClick={() => edit('rules')}>Review rules</button>}
        </div>
      )}
      <PaperSheet character={c} engine={engine} run={run} edit={edit} />
      <div className="sheet-grid">
        <div className="sheet-main">
          <section className="panel inventory-panel">
            <div className="tab-heading">
              <div role="tablist" aria-label="Character details">
                {['inventory', 'notes', 'history'].map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    className={tab === t ? 'active' : ''}
                    onClick={() => setTab(t)}
                  >
                    {t === 'inventory' ? (
                      <Archive size={16} />
                    ) : t === 'notes' ? (
                      <ScrollText size={16} />
                    ) : (
                      <Undo2 size={16} />
                    )}{' '}
                    {t[0].toUpperCase() + t.slice(1)}
                    {t === 'inventory' && <span className="count">{s.cards.length}</span>}
                  </button>
                ))}
              </div>
              {canEdit && tab === 'inventory' && (
                <button className="text-button" onClick={() => edit('add-card')}>
                  <Plus size={15} /> Add card
                </button>
              )}
            </div>
            {tab === 'inventory' && (
              <div className="panel-body">
                <input
                  className="search"
                  placeholder="Search held cards…"
                  aria-label="Search held cards"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="card-list">
                  {s.cards
                    .filter((h) =>
                      (engine.cache.cards.find((d) => d.id === h.definitionId)?.name || '')
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((h) => {
                      const d = engine.cache.cards.find((d) => d.id === h.definitionId);
                      return (
                        <HeldCard
                          key={h.id}
                          definition={d}
                          quantity={h.quantity}
                          equipped={h.equipped}
                          notes={h.notes}
                          disabled={!canEdit}
                          onQuantity={(delta) => {
                            if (h.quantity + delta > 0)
                              updateCard(h.id, { quantity: h.quantity + delta });
                            else
                              change(
                                { ...s, cards: s.cards.filter((x) => x.id !== h.id) },
                                'Removed card',
                              );
                          }}
                          onEquip={() => updateCard(h.id, { equipped: !h.equipped })}
                          onNotes={(notes) => updateCard(h.id, { notes })}
                        />
                      );
                    })}
                </div>
                {!s.cards.length && (
                  <Empty title="A little room for adventure">
                    Add equipment, recipes, and quest cards from your group’s library. Their effects
                    will be right here when you need them.
                  </Empty>
                )}
              </div>
            )}
            {tab === 'notes' && (
              <div className="panel-body">
                <TextEditor
                  label="Adventure notes · saves when you leave the field"
                  multiline
                  value={s.notes}
                  disabled={!canEdit}
                  onSave={(notes) => change({ ...s, notes }, 'Updated adventure notes')}
                />
                <TextEditor
                  label="Cape objectives & benefits"
                  multiline
                  value={s.capeNotes}
                  disabled={!canEdit}
                  onSave={(capeNotes) => change({ ...s, capeNotes }, 'Updated cape notes')}
                />
              </div>
            )}
            {tab === 'history' && (
              <div className="panel-body">
                <div className="history-list">
                  {engine.cache.actions
                    .filter((a) => a.character_id === c.id)
                    .slice(0, 100)
                    .map((a) => (
                      <div className="history-item" key={a.id}>
                        <span className="history-dot" />
                        <div>
                          <strong>{a.label}</strong>
                          <small>
                            {a.actor_name} · {new Date(a.created_at).toLocaleString()}
                          </small>
                        </div>
                        <span className="muted">#{a.revision}</span>
                      </div>
                    ))}
                </div>
                {!latest && (
                  <Empty title="Your story starts here">
                    Saved changes will appear here, along with who made them.
                  </Empty>
                )}
              </div>
            )}
          </section>
        </div>
        <aside className="sheet-aside">
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <ShieldCheck size={19} /> Adventurer
              </h2>
            </div>
            <div className="vitals">
              {(['hitpoints'] as const).map((k) => (
                <div key={k}>
                  <span>
                    {
                      {
                        wounds: 'Wounds',
                        deaths: 'Death tally',
                        sideQuests: 'Side quests',
                        hitpoints: 'Hitpoints',
                      }[k]
                    }
                  </span>
                  <Counter
                    label={k}
                    value={s[k]}
                    disabled={!canEdit}
                    onChange={(d) => change({ ...s, [k]: s[k] + d }, `Updated ${k}`)}
                  />
                </div>
              ))}
            </div>
            <div className="panel-body">
              <label>
                Campaign
                <select
                  disabled={!canEdit}
                  value={c.campaign_id || ''}
                  onChange={(e) => run(() => engine.assign(c, e.target.value || null))}
                >
                  <option value="">Between campaigns</option>
                  {engine.cache.campaigns
                    .filter((x) => x.group_id === c.group_id && x.status === 'active')
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </section>
          <section className="panel save-panel">
            <div className="panel-heading">
              <h2>
                <Archive size={19} /> Save & recover
              </h2>
            </div>
            <div className="panel-body">
              <p className="muted">
                Changes save after every action. Checkpoints let you return to an earlier moment.
              </p>
              <button
                className="wide"
                disabled={
                  !canEdit ||
                  !latest ||
                  latest.revision !== c.revision ||
                  engine.cache.pending.some((p) => p.characterId === c.id)
                }
                onClick={() =>
                  run(() =>
                    engine.enqueue(
                      c,
                      { kind: 'undo', actionId: latest!.id },
                      `Undo: ${latest!.label}`,
                    ),
                  )
                }
              >
                <Undo2 size={16} /> Undo latest action
              </button>
              <button className="wide" onClick={() => edit('checkpoints')}>
                <Archive size={16} /> Browse checkpoints
              </button>
              <div className="save-caption">
                Revision {c.revision}
                <br />
                {new Date(c.updated_at).toLocaleString()}
              </div>
            </div>
          </section>
          <div className="session-tip">
            <ScrollText size={23} />
            <h3>Ready when you return.</h3>
            <p>
              At the end of game night, your host can save a party checkpoint and download a backup.
            </p>
          </div>
        </aside>
      </div>
      <div className="print-summary">
        <h1>{s.name}</h1>
        <p>
          Shadow of Elvarg · {owner} · Revision {c.revision}
        </p>
        <h2>Skills</h2>
        <div className="print-grid">
          {skills.map((k) => (
            <p key={k}>
              {labels[k]}: level {s.skills[k].level}, {s.skills[k].xp} XP
            </p>
          ))}
        </div>
        <h2>Resources</h2>
        <div className="print-grid">
          {Object.entries(s.resources).map(([k, v]) => (
            <p key={k}>
              {labels[k] || k}: {v}
            </p>
          ))}
        </div>
        <p>
          Wounds: {s.wounds} · Deaths: {s.deaths} · Side quests: {s.sideQuests} · Hitpoints:{' '}
          {s.hitpoints}
        </p>
        <h2>Held cards</h2>
        {s.cards.map((h) => {
          const d = engine.cache.cards.find((x) => x.id === h.definitionId);
          return (
            <article key={h.id}>
              <h3>
                {d?.name} × {h.quantity} {h.equipped ? '(equipped / active)' : ''}
              </h3>
              <p>{d?.effects}</p>
              <p>{d?.requirements}</p>
              <p>{h.notes}</p>
            </article>
          );
        })}
        <h2>Notes & cape objectives</h2>
        <p>{s.notes}</p>
        <p>{s.capeNotes}</p>
      </div>
    </>
  );
}
function HeldCard({
  definition: d,
  quantity,
  equipped,
  notes,
  disabled,
  onQuantity,
  onEquip,
  onNotes,
}: {
  definition?: Card;
  quantity: number;
  equipped: boolean;
  notes: string;
  disabled: boolean;
  onQuantity: (n: number) => void;
  onEquip: () => void;
  onNotes: (n: string) => void;
}) {
  return (
    <article className="held-card">
      <div className="held-heading">
        <div className="card-emblem">
          <Icon name={d?.kind === 'weapon' ? 'attack' : d?.kind === 'armour' ? 'defence' : 'xp'} />
        </div>
        <div>
          <span className="eyebrow">{d?.kind || 'Card'}</span>
          <h3>{d?.name || 'Missing card reference'}</h3>
        </div>
        <Counter
          label={d?.name || 'card'}
          value={quantity}
          disabled={disabled}
          onChange={onQuantity}
        />
      </div>
      <p className="card-effects">{d?.effects || 'No effect text recorded yet.'}</p>
      {d?.requirements && <p className="requirements">Requires: {d.requirements}</p>}
      <div className="held-bottom">
        <label className="check">
          <input type="checkbox" checked={equipped} disabled={disabled} onChange={onEquip} />{' '}
          Equipped / active
        </label>
        <span className="muted">Reference v{d?.revision}</span>
      </div>
      <TextEditor label="Card state / notes" value={notes} disabled={disabled} onSave={onNotes} />
    </article>
  );
}
