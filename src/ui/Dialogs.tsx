import { useEffect, useState } from 'react';
import { Modal } from './components';
import { skills, resources, labels, newState, stateSchema, cardSchema } from '../domain/model';
import type { Character, Card, Pending, Campaign, State } from '../domain/model';
import type { Engine } from '../data/engine';
import { cropPortrait, download, exportBackup, readBackup } from '../data/backup';
import type { Backup } from '../data/backup';
import { putPortrait } from '../data/storage';
import { rpc, supabase } from '../data/client';
type Props = {
  modal: { kind: string; data?: unknown; character?: Character };
  engine: Engine;
  groupId: string;
  close: () => void;
  notify: (s: string) => void;
  go: (s: string) => void;
  signedOut: () => void;
};
export default function Dialogs({ modal, engine, groupId, close, notify, go, signedOut }: Props) {
  const { kind, data, character: c } = modal;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [state, setState] = useState<State>(
    c ? structuredClone(c.state) : newState('New adventurer'),
  );
  const [card, setCard] = useState<Card>(
    (kind === 'card-editor' && (data as Card)) || {
      id: crypto.randomUUID(),
      group_id: groupId,
      revision: 1,
      name: '',
      kind: 'weapon',
      effects: '',
      requirements: '',
    },
  );
  const [selected, setSelected] = useState('');
  const [amount, setAmount] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0.5);
  const [y, setY] = useState(0.5);
  const [imported, setImported] = useState<{ data: Backup; images: Map<string, Blob> } | null>(
    null,
  );
  const submit = (fn: () => Promise<void>, dismiss = true) => {
    setError('');
    setBusy(true);
    void fn()
      .then(() => {
        if (dismiss) close();
      })
      .catch((e) => setError(e.message || String(e)))
      .finally(() => setBusy(false));
  };
  useEffect(() => {
    if (!file || kind !== 'portrait') return;
    let cancelled = false;
    let url = '';
    void cropPortrait(file, zoom, x, y)
      .then((b) => {
        if (!cancelled) {
          url = URL.createObjectURL(b);
          setPreview(url);
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, zoom, x, y, kind]);
  const footer = (label: string, fn: () => Promise<void>, disabled = false) => (
    <div className="modal-actions">
      <button disabled={busy} onClick={close}>
        Cancel
      </button>
      <button className="primary" disabled={busy || disabled} onClick={() => submit(fn)}>
        {busy ? 'Saving…' : label}
      </button>
    </div>
  );
  const saveState = (label: string) =>
    engine.enqueue(c!, { kind: 'replace', state: stateSchema.parse(state) }, label);
  let title = '';
  let content: React.ReactNode;
  if (['create-character', 'create-group', 'campaign'].includes(kind)) {
    title =
      kind === 'create-character'
        ? 'A new adventurer'
        : kind === 'create-group'
          ? 'Create your group'
          : 'Start a campaign';
    const create = async () => {
      if (kind === 'create-character')
        go(`character/${await engine.createCharacter(groupId, name.trim())}`);
      else if (kind === 'create-group') await engine.createGroup(name.trim());
      else await engine.campaign(groupId, name.trim());
    };
    content = (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && name.trim()) submit(create);
        }}
      >
        <label>
          {kind === 'create-character' ? 'Character name' : 'Name'}
          <input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        {kind === 'create-character' && (
          <p className="muted">
            Enter your printed starting levels and supplies with the correction tool after creation.
          </p>
        )}
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={close}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Create'}
          </button>
        </div>
      </form>
    );
  } else if (kind === 'correction') {
    title = 'Correct character values';
    content = (
      <>
        <p className="muted">
          This creates a recovery checkpoint and records the correction in history.
        </p>
        <label>
          Character name
          <input
            value={state.name}
            maxLength={80}
            onChange={(e) => setState({ ...state, name: e.target.value })}
          />
        </label>
        <div className="correction-grid">
          {skills.map((k) => (
            <div key={k}>
              <strong>{labels[k]}</strong>
              <label>
                Level
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={state.skills[k].level}
                  onChange={(e) =>
                    setState({
                      ...state,
                      skills: {
                        ...state.skills,
                        [k]: { ...state.skills[k], level: Number(e.target.value) },
                      },
                    })
                  }
                />
              </label>
              <label>
                XP
                <input
                  type="number"
                  min={0}
                  max={2}
                  value={state.skills[k].xp}
                  onChange={(e) =>
                    setState({
                      ...state,
                      skills: {
                        ...state.skills,
                        [k]: { ...state.skills[k], xp: Number(e.target.value) },
                      },
                    })
                  }
                />
              </label>
            </div>
          ))}
        </div>
        <div className="form-grid">
          {Object.entries(state.resources).map(([k, v]) => (
            <label key={k}>
              {labels[k] || k}
              <input
                type="number"
                min={0}
                value={v}
                onChange={(e) =>
                  setState({
                    ...state,
                    resources: { ...state.resources, [k]: Number(e.target.value) },
                  })
                }
              />
            </label>
          ))}
        </div>
        {footer('Save correction', async () => {
          await saveState('Corrected character values');
        })}
      </>
    );
  } else if (kind === 'resource') {
    title = 'Add a resource counter';
    content = (
      <>
        <p className="muted">
          Choose a suggestion or enter the name printed on your token. Values represent supplies,
          not physical token counts.
        </p>
        <label>
          Resource
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Custom resource…</option>
            {resources
              .filter((k) => !(k in c!.state.resources))
              .map((k) => (
                <option key={k} value={k}>
                  {labels[k]}
                </option>
              ))}
          </select>
        </label>
        {!selected && (
          <label>
            Counter name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. runeEssence"
              pattern="[a-zA-Z][a-zA-Z0-9]{0,39}"
            />
            <small>Letters and numbers, beginning with a letter.</small>
          </label>
        )}
        <label>
          Starting amount
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </label>
        {footer(
          'Add counter',
          async () => {
            const key = selected || name.trim();
            if (key in c!.state.resources) throw Error('This counter already exists.');
            await engine.enqueue(
              c!,
              { kind: 'resource', key, delta: amount },
              `Added ${key} counter`,
            );
          },
          !selected && !name.trim(),
        )}
      </>
    );
  } else if (kind === 'card-editor') {
    title = data ? 'Edit card reference' : 'Add a card reference';
    content = (
      <>
        <label>
          Card name
          <input
            value={card.name}
            maxLength={100}
            onChange={(e) => setCard({ ...card, name: e.target.value })}
          />
        </label>
        <label>
          Type
          <select
            value={card.kind}
            onChange={(e) => setCard({ ...card, kind: e.target.value as Card['kind'] })}
          >
            {['weapon', 'armour', 'accessory', 'cape', 'recipe', 'quest', 'other'].map((k) => (
              <option key={k} value={k}>
                {k[0].toUpperCase() + k.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Effects
          <textarea
            value={card.effects}
            maxLength={10000}
            onChange={(e) => setCard({ ...card, effects: e.target.value })}
            placeholder="Record the card’s effect from your physical copy."
          />
        </label>
        <label>
          Requirements
          <textarea
            value={card.requirements}
            maxLength={4000}
            onChange={(e) => setCard({ ...card, requirements: e.target.value })}
          />
        </label>
        <p className="muted">
          Reference text is shared within this group. Effects are resolved by players.
        </p>
        {footer(
          'Save reference',
          async () => {
            await engine.saveCard(cardSchema.parse(card));
          },
          !card.name.trim(),
        )}
      </>
    );
  } else if (kind === 'add-card') {
    title = 'Add a held card';
    const cards = engine.cache.cards.filter((d) => d.group_id === c!.group_id);
    content = (
      <>
        <label>
          Search cards
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Card
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Choose a card…</option>
            {cards
              .filter((d) => d.name.toLowerCase().includes(name.toLowerCase()))
              .map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Quantity
          <input
            type="number"
            min={1}
            max={999}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </label>
        {!cards.length && (
          <p className="muted">Your host needs to add a reference in the Card library first.</p>
        )}
        {footer(
          'Add to inventory',
          async () => {
            await engine.enqueue(
              c!,
              {
                kind: 'replace',
                state: {
                  ...c!.state,
                  cards: [
                    ...c!.state.cards,
                    {
                      id: crypto.randomUUID(),
                      definitionId: selected,
                      quantity: amount,
                      equipped: false,
                      notes: '',
                    },
                  ],
                },
              },
              'Added held card',
            );
          },
          !selected,
        )}
      </>
    );
  } else if (kind === 'checkpoints') {
    title = 'Character checkpoints';
    const cps = engine.cache.checkpoints.filter((cp) => cp.character_id === c!.id);
    content = (
      <>
        <p className="muted">
          Restoring creates a new history entry and a recovery checkpoint of your current state.
        </p>
        <div className="checkpoint-list">
          {cps.map((cp) => (
            <div className="list-row" key={cp.id}>
              <label className="check">
                <input
                  type="radio"
                  name="checkpoint"
                  value={cp.id}
                  checked={selected === cp.id}
                  onChange={() => setSelected(cp.id)}
                />
                <span>
                  <strong>
                    {cp.kind} · revision {cp.revision}
                  </strong>
                  <small>{new Date(cp.created_at).toLocaleString()}</small>
                </span>
              </label>
            </div>
          ))}
        </div>
        {!cps.length && <p>No checkpoints yet. Your first saved action creates one.</p>}
        {engine.canEdit(c!) && (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{' '}
              Restore this checkpoint over the current character state.
            </label>
            {footer(
              'Restore checkpoint',
              async () => {
                await engine.enqueue(
                  c!,
                  { kind: 'restore', checkpointId: selected },
                  'Restored checkpoint',
                );
              },
              !selected || !confirmed,
            )}
            <button
              disabled={!selected || !confirmed || busy}
              className="danger-text"
              onClick={() =>
                submit(async () => {
                  await engine.deleteCheckpoint(selected);
                }, false)
              }
            >
              Delete selected checkpoint permanently
            </button>
          </>
        )}
      </>
    );
  } else if (kind === 'invite') {
    title = 'Invite your party';
    const url = `${location.origin}${import.meta.env.BASE_URL}#invite/${String(data)}`;
    content = (
      <>
        <p>
          Anyone with this link can join your group after signing in with Discord. It expires in
          seven days and can be revoked in group settings.
        </p>
        <label>
          Invitation link
          <input readOnly value={url} onFocus={(e) => e.target.select()} />
        </label>
        <div className="modal-actions">
          <button onClick={close}>Done</button>
          <button
            className="primary"
            onClick={() =>
              submit(async () => {
                await navigator.clipboard.writeText(url);
                notify('Invitation link copied.');
              })
            }
          >
            Copy link
          </button>
        </div>
      </>
    );
  } else if (kind === 'archive-campaign') {
    title = 'Archive campaign';
    const campaign = data as Campaign;
    content = (
      <>
        <p>
          Archive <b>{campaign.name}</b>? Characters return to “Between campaigns.” All character
          progress stays intact.
        </p>
        {footer('Archive campaign', async () => {
          await engine.campaign(groupId, '', campaign.id);
        })}
      </>
    );
  } else if (kind === 'finish') {
    title = 'Finish this session';
    content = (
      <>
        <p>Save a checkpoint for every character in this group.</p>
        <p className="notice">
          This includes confirmed cloud changes only. Offline players’ unsynced edits cannot be
          included. Ask everyone to check their save status first.
        </p>
        {engine.peers.map((p, i) => (
          <p key={i}>
            {p.name}: {p.pending ? `${p.pending} pending changes` : 'no pending changes reported'}
          </p>
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />{' '}
          Everyone has checked their save status.
        </label>
        {footer(
          'Save session checkpoint',
          async () => {
            await engine.finish(groupId);
            notify(
              'Session checkpoint saved. Use Group backup to download your confirmed progress.',
            );
          },
          !confirmed || engine.cache.pending.length > 0 || engine.peers.some((p) => p.pending > 0),
        )}
      </>
    );
  } else if (kind === 'conflict') {
    title = 'Review pending change';
    const pending = data as Pending;
    content = (
      <>
        <p>{pending.label}</p>
        <p className="error">{pending.error}</p>
        <pre>{JSON.stringify(pending.operation, null, 2)}</pre>
        <p>
          Discarding also removes later queued edits for this character. Download the queue first if
          you want to preserve those intended changes for manual correction.
        </p>
        <button
          onClick={() =>
            download(
              new Blob(
                [
                  JSON.stringify(
                    engine.cache.pending.filter((p) => p.characterId === pending.characterId),
                    null,
                    2,
                  ),
                ],
                { type: 'application/json' },
              ),
              'pending-actions.json',
            )
          }
        >
          Download pending actions
        </button>
        <label className="check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />{' '}
          Discard this change and dependent queued edits.
        </label>
        {footer(
          'Discard pending edits',
          async () => {
            await engine.discard(pending.id);
          },
          !confirmed,
        )}
      </>
    );
  } else if (kind === 'signout') {
    title = 'Changes are still pending';
    content = (
      <>
        <p>
          Your changes are saved on this device but have not all reached the server. They will
          remain queued for this account when you return.
        </p>
        <button
          onClick={() =>
            submit(async () => {
              await exportBackup(
                engine.cache,
                engine.cache.characters.map((c) => engine.projected(c)),
                engine.account,
                engine.local,
              );
            }, false)
          }
        >
          Download current progress first
        </button>
        {footer('Sign out anyway', async () => {
          if (!engine.local) await supabase!.auth.signOut();
          signedOut();
        })}
      </>
    );
  } else if (kind === 'portrait') {
    title = 'Character portrait';
    content = (
      <>
        <label>
          Choose image
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <small>JPEG, PNG, or WebP · up to 8 MB</small>
        </label>
        {preview && (
          <>
            <img className="crop-preview" src={preview} alt="Cropped portrait preview" />
            <label>
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
            <label>
              Horizontal position
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={x}
                onChange={(e) => setX(Number(e.target.value))}
              />
            </label>
            <label>
              Vertical position
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={y}
                onChange={(e) => setY(Number(e.target.value))}
              />
            </label>
          </>
        )}
        {footer(
          'Save portrait',
          async () => {
            await savePortrait(engine, c!, await cropPortrait(file!, zoom, x, y));
          },
          !file || !preview,
        )}
        {c!.portrait_path && (
          <button
            disabled={busy}
            className="danger-text"
            onClick={() =>
              submit(async () => {
                const old = c!.portrait_path;
                await engine.portrait(c!, null);
                if (!engine.local && old) await supabase!.storage.from('portraits').remove([old]);
              })
            }
          >
            Remove portrait
          </button>
        )}
      </>
    );
  } else if (kind === 'import') {
    title = 'Import a character backup';
    const replace = selected ? engine.cache.characters.find((c) => c.id === selected) : undefined;
    content = (
      <>
        <label>
          Backup file
          <input
            type="file"
            accept=".json,.zip"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                submit(async () => {
                  setImported(await readBackup(f));
                }, false);
            }}
          />
        </label>
        {imported && (
          <>
            <h3>Preview</h3>
            {imported.data.characters.map((c) => (
              <p key={c.id}>
                <b>{c.state.name}</b> · {c.state.cards.length} held cards
              </p>
            ))}
            <p className="muted">
              {imported.data.cards.length} card references · exported{' '}
              {new Date(imported.data.exportedAt).toLocaleString()}
              {imported.data.pendingChanges > 0
                ? ` · ${imported.data.pendingChanges} changes were unconfirmed when exported`
                : ''}
            </p>
            <label>
              Import mode
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">Create new character(s)</option>
                {imported.data.characters.length === 1 &&
                  engine.cache.characters
                    .filter((c) => c.group_id === groupId && engine.canEdit(c))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        Replace {c.state.name}
                      </option>
                    ))}
              </select>
            </label>
            {replace && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{' '}
                Replace {replace.state.name}; keep a recovery checkpoint.
              </label>
            )}
            <p className="muted">
              Imported card definitions are copied into this group. New references require host
              access. Portraits upload after the character import.
            </p>
            {footer(
              'Import backup',
              async () => {
                if (engine.cache.pending.length)
                  throw Error('Save or resolve pending changes before importing.');
                const ids = await importData(engine, groupId, imported.data, replace);
                let portraitsFailed = false;
                for (let i = 0; i < ids.length; i++) {
                  const blob = imported.images.get(imported.data.characters[i].id);
                  if (blob) {
                    try {
                      const character = engine.cache.characters.find((c) => c.id === ids[i])!;
                      await savePortrait(engine, character, await cropPortrait(blob));
                    } catch {
                      portraitsFailed = true;
                    }
                  }
                }
                notify(
                  portraitsFailed
                    ? 'Characters imported. Some portraits could not upload; add them from the character sheet.'
                    : 'Backup imported successfully.',
                );
                go(`character/${ids[0]}`);
              },
              !!replace && !confirmed,
            )}
          </>
        )}
      </>
    );
  } else {
    title = 'Character companion';
    content = <p>Choose an action.</p>;
  }
  return (
    <Modal
      title={title}
      close={() => {
        if (!busy) close();
      }}
    >
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {content}
    </Modal>
  );
}
export async function savePortrait(engine: Engine, c: Character, blob: Blob) {
  const path = `${c.id}/${crypto.randomUUID()}.webp`;
  if (!engine.local) {
    const { error } = await supabase!.storage
      .from('portraits')
      .upload(path, blob, { contentType: 'image/webp' });
    if (error) throw error;
  }
  await putPortrait(engine.account, path, blob);
  await engine.portrait(c, path);
  if (!engine.local && c.portrait_path)
    await supabase!.storage.from('portraits').remove([c.portrait_path]);
}
async function importData(engine: Engine, group: string, backup: Backup, replace?: Character) {
  const mappings = new Map(backup.cards.map((c) => [c.id, crypto.randomUUID()]));
  const cards = backup.cards.map((c) => ({
    ...c,
    id: mappings.get(c.id)!,
    group_id: group,
    revision: 1,
  }));
  const entries = backup.characters.map((c) => ({
    id: replace?.id || crypto.randomUUID(),
    state: {
      ...c.state,
      cards: c.state.cards.map((h) => ({
        ...h,
        id: crypto.randomUUID(),
        definitionId: mappings.get(h.definitionId)!,
      })),
    },
  }));
  if (engine.local) await engine.importLocal(group, entries, cards, replace);
  else {
    await rpc('import_bundle', {
      p_group: group,
      p_cards: cards,
      p_characters: entries,
      p_replace: replace?.id || null,
      p_expected: replace?.revision || 0,
      p_action: crypto.randomUUID(),
    });
    await engine.refresh();
  }
  return entries.map((e) => e.id);
}
