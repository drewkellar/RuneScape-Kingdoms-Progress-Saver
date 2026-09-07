import { useEffect, useState } from 'react';
import {
  Swords,
  Users,
  BookOpen,
  Settings,
  Plus,
  LogOut,
  Cloud,
  CloudOff,
  Check,
  Upload,
  Flag,
  Download,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { Engine, LOCAL_ID } from '../data/engine';
import { supabase } from '../data/client';
import { exportBackup } from '../data/backup';
import Sheet, { Portrait } from './Sheet';
import Dialogs from './Dialogs';
import { Empty } from './components';
import type { Character } from '../domain/model';
export default function App() {
  const [identity, setIdentity] = useState<{ id: string; name: string; local: boolean } | null>(
    null,
  );
  const [authReady, setAuthReady] = useState(!supabase);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [, render] = useState(0);
  const [route, setRoute] = useState(location.hash.slice(1) || 'characters');
  const [groupId, setGroupId] = useState('');
  const [modal, setModal] = useState<{
    kind: string;
    data?: unknown;
    character?: Character;
  } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const fn = () => setRoute(location.hash.slice(1) || 'characters');
    window.addEventListener('hashchange', fn);
    const net = () => setOnline(navigator.onLine);
    window.addEventListener('online', net);
    window.addEventListener('offline', net);
    return () => {
      window.removeEventListener('hashchange', fn);
      window.removeEventListener('online', net);
      window.removeEventListener('offline', net);
    };
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIdentity(
        session
          ? {
              id: session.user.id,
              name:
                session.user.user_metadata.full_name ||
                session.user.user_metadata.name ||
                'Adventurer',
              local: false,
            }
          : null,
      );
      setAuthReady(true);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      const u = data.session?.user;
      if (u)
        setIdentity({
          id: u.id,
          name: u.user_metadata.full_name || u.user_metadata.name || 'Adventurer',
          local: false,
        });
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!identity) {
      setEngine(null);
      return;
    }
    const e = new Engine(identity.id, identity.name, identity.local);
    const unsubscribe = e.subscribe(() => render((x) => x + 1));
    setEngine(e);
    void e.init().catch((err) => setError(err.message));
    return () => {
      unsubscribe();
      e.stop();
    };
  }, [identity?.id]);
  const run = (fn: () => Promise<unknown>) => {
    setError('');
    void fn().catch((e) => setError(e.message || String(e)));
  };
  const go = (r: string) => {
    location.hash = r;
  };
  const groups = engine?.cache.groups || [];
  const group = groups.find((g) => g.id === groupId) || groups[0];
  useEffect(() => {
    if (group?.id) engine?.watchGroup(group.id);
  }, [engine, group?.id]);
  const characters = engine?.cache.characters.filter((c) => c.group_id === group?.id) || [];
  const selected = engine?.cache.characters.find((c) => route === `character/${c.id}`);
  const character = selected && engine?.projected(selected);
  const host = group?.host_id === identity?.id;
  const backup = (cs = characters) =>
    run(() =>
      exportBackup(
        engine!.cache,
        cs.map((c) => engine!.projected(c)),
        engine!.account,
        engine!.local,
      ),
    );
  const open = (kind: string, data?: unknown) => setModal({ kind, data, character });
  if (!authReady) return <div className="loading">Opening your adventurer’s journal…</div>;
  if (!engine || !identity)
    return (
      <main className="welcome">
        <img src={`${import.meta.env.BASE_URL}crest.svg`} alt="" />
        <div className="eyebrow">RUNESCAPE KINGDOMS · SHADOW OF ELVARG</div>
        <h1>
          Your adventure.
          <br />
          <em>Never lost.</em>
        </h1>
        <p>
          A place for your character, your hard-earned experience,
          <br />
          and everything you’ll bring to the next game night.
        </p>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <button
          className="primary"
          disabled={!supabase}
          onClick={() =>
            run(async () => {
              const invitation = location.hash.startsWith('#invite/')
                ? location.hash.slice(8)
                : null;
              if (invitation) sessionStorage.setItem('kingdoms-invitation', invitation);
              const { error } = await supabase!.auth.signInWithOAuth({
                provider: 'discord',
                options: { redirectTo: location.origin + import.meta.env.BASE_URL },
              });
              if (error) throw error;
            })
          }
        >
          <Users size={18} /> Continue with Discord
        </button>
        <button
          onClick={() => setIdentity({ id: LOCAL_ID, name: 'Local adventurer', local: true })}
        >
          Try on this device
        </button>
        <small>
          {supabase
            ? 'Local mode stays on this browser and does not sync.'
            : 'Cloud connection not configured yet. Local mode is ready to use.'}
        </small>
        <div className="welcome-features">
          <span>
            <Swords /> Every skill, remembered
          </span>
          <span>
            <Cloud /> A shared party journal
          </span>
          <span>
            <Download /> Your saves to keep
          </span>
        </div>
        <footer>Unofficial character companion · No game board required</footer>
      </main>
    );
  const inviteToken = route.startsWith('invite/')
    ? route.slice(7)
    : sessionStorage.getItem('kingdoms-invitation');
  const pending = engine.cache.pending.length;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#characters">
          <img src={`${import.meta.env.BASE_URL}crest.svg`} alt="" />
          <span>
            KINGDOMS<small>CHARACTER COMPANION</small>
          </span>
        </a>
        <div className="sidebar-section">
          <span className="eyebrow">YOUR TABLE</span>
          <select
            aria-label="Current group"
            value={group?.id || ''}
            onChange={(e) => {
              setGroupId(e.target.value);
              go('characters');
            }}
          >
            {!groups.length && <option value="">No group yet</option>}
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <nav>
          <a href="#characters" className={route === 'characters' || character ? 'active' : ''}>
            <Swords size={18} /> Characters <span>{characters.length}</span>
          </a>
          <a href="#party" className={route === 'party' ? 'active' : ''}>
            <Users size={18} /> Party overview
          </a>
          <a href="#library" className={route === 'library' ? 'active' : ''}>
            <BookOpen size={18} /> Card library
          </a>
          <a href="#settings" className={route === 'settings' ? 'active' : ''}>
            <Settings size={18} /> Group & campaigns
          </a>
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-section">
          <span className="eyebrow">YOUR CHARACTERS</span>
          {characters
            .filter((c) => c.owner_id === engine.account)
            .map((c) => (
              <a
                className={`mini-character ${selected?.id === c.id ? 'selected' : ''}`}
                key={c.id}
                href={`#character/${c.id}`}
              >
                <Portrait character={c} engine={engine} />
                <span>{c.state.name}</span>
              </a>
            ))}
          <button
            className="text-button"
            disabled={!group}
            onClick={() => open('create-character')}
          >
            <Plus size={15} /> New character
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="local-badge">{engine.local ? 'LOCAL WORKSPACE' : 'PRIVATE GROUP'}</div>
          <div className="account">
            <span className="account-avatar">{identity.name[0]}</span>
            <div>
              {identity.name}
              <small>{engine.local ? 'Saved on this browser' : 'Connected with Discord'}</small>
            </div>
            <button
              aria-label="Sign out"
              className="icon-button"
              onClick={() => {
                if (pending) {
                  open('signout');
                  return;
                }
                run(async () => {
                  if (!engine.local) await supabase!.auth.signOut();
                  setIdentity(null);
                });
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="online-dot" />
            {group?.name || 'Welcome, adventurer'}
          </div>
          <div className={`sync-status ${engine.error ? 'warning' : ''}`} role="status">
            {pending || !online || engine.error ? <CloudOff size={16} /> : <Check size={16} />}{' '}
            {engine.local
              ? pending
                ? 'Saving locally…'
                : 'Saved on this device'
              : engine.error
                ? 'Connection needs attention'
                : !online
                  ? pending
                    ? 'Offline—changes pending'
                    : 'Offline—cached copy'
                  : pending
                    ? engine.syncing
                      ? 'Syncing…'
                      : `${pending} changes pending`
                    : 'Saved'}
            {!engine.local && (
              <button
                className="icon-button"
                aria-label="Retry cloud connection"
                onClick={() =>
                  run(async () => {
                    await engine.refresh();
                    await engine.pump();
                  })
                }
              >
                <RefreshCw size={14} />
              </button>
            )}
          </div>
        </header>
        <main>
          {engine.local && (
            <div className="local-notice">
              LOCAL MODE{' '}
              <span>
                Changes stay in this browser. Download a backup before moving to another device.
              </span>
            </div>
          )}
          {(error || engine.error) && (
            <div className="error" role="alert">
              {error || engine.error}
              <button
                onClick={() => {
                  setError('');
                  engine.error = '';
                  render((x) => x + 1);
                }}
              >
                Dismiss
              </button>
            </div>
          )}
          {message && (
            <div className="notice" role="status">
              {message}
              <button onClick={() => setMessage('')}>Dismiss</button>
            </div>
          )}
          {engine.cache.pending
            .filter((p) => p.error)
            .map((p) => (
              <div key={p.id} className="error">
                <div>
                  <b>Change needs review: {p.label}</b>
                  <p>{p.error}</p>
                  <small>
                    Your queued change is preserved. Download pending actions before discarding this
                    change and its dependent edits.
                  </small>
                </div>
                <button onClick={() => open('conflict', p)}>Review</button>
              </div>
            ))}
          {inviteToken && !engine.local && (
            <div className="notice">
              <span>You have a group invitation.</span>
              <button
                className="primary"
                onClick={() =>
                  run(async () => {
                    await engine.join(inviteToken);
                    sessionStorage.removeItem('kingdoms-invitation');
                    go('characters');
                  })
                }
              >
                Join group
              </button>
            </div>
          )}
          {!group ? (
            <div className="page-heading">
              <div className="eyebrow">START YOUR ADVENTURE</div>
              <h1>A place for your party.</h1>
              <p>Create a private group, or open an invitation from your host.</p>
              <button className="primary" onClick={() => open('create-group')}>
                <Plus size={16} /> Create group
              </button>
            </div>
          ) : character ? (
            <Sheet
              key={character.id}
              engine={engine}
              character={character}
              run={run}
              edit={open}
              download={() => backup([selected!])}
            />
          ) : route === 'library' ? (
            <>
              <PageTitle
                eyebrow="YOUR GROUP’S REFERENCE"
                title="The card library"
                description="Equipment, recipes, and discoveries. Add the cards your party finds."
                action={
                  host ? (
                    <button className="primary" onClick={() => open('card-editor')}>
                      <Plus size={16} /> New card
                    </button>
                  ) : undefined
                }
              />
              <Library
                engine={engine}
                groupId={group.id}
                edit={(d) => open('card-editor', d)}
                host={host}
              />
            </>
          ) : route === 'settings' ? (
            <>
              <PageTitle
                eyebrow="AROUND THE TABLE"
                title="Group & campaigns"
                description="Keep your party together. Your characters outlive every campaign."
              />
              <section className="panel">
                <div className="panel-heading">
                  <h2>{group.name}</h2>
                  <span>{host ? 'You are the host' : 'Group member'}</span>
                </div>
                <div className="panel-body">
                  <h3>Adventurers</h3>
                  {engine.cache.members
                    .filter((m) => m.group_id === group.id)
                    .map((m) => (
                      <p key={m.user_id}>
                        {m.display_name}{' '}
                        {m.user_id === group.host_id && <span className="badge">HOST</span>}
                      </p>
                    ))}
                  {host && (
                    <button
                      disabled={engine.local}
                      onClick={() => run(async () => open('invite', await engine.invite(group.id)))}
                    >
                      <Users size={16} /> Create invitation link
                    </button>
                  )}
                  {engine.local && (
                    <p className="muted">Invitations require a connected Supabase project.</p>
                  )}
                  {engine.cache.invitations
                    .filter((i) => i.group_id === group.id && !i.revoked)
                    .map((i) => (
                      <div className="list-row" key={i.id}>
                        <span>
                          Invitation · expires {new Date(i.expires_at).toLocaleDateString()}
                        </span>
                        <button onClick={() => run(() => engine.revoke(i.id))}>Revoke</button>
                      </div>
                    ))}
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Campaigns</h2>
                  {host && (
                    <button onClick={() => open('campaign')}>
                      <Plus size={16} /> New campaign
                    </button>
                  )}
                </div>
                <div className="panel-body">
                  {engine.cache.campaigns
                    .filter((c) => c.group_id === group.id)
                    .map((c) => (
                      <div className="list-row" key={c.id}>
                        <div>
                          <strong>{c.name}</strong>
                          <small>{c.status}</small>
                        </div>
                        {host && c.status === 'active' && (
                          <button onClick={() => open('archive-campaign', c)}>Archive</button>
                        )}
                      </div>
                    ))}
                  {!engine.cache.campaigns.some((c) => c.group_id === group.id) && (
                    <Empty title="Between adventures">
                      Create a campaign when you’re ready. Character progress is always retained.
                    </Empty>
                  )}
                </div>
              </section>
              <button onClick={() => open('create-group')}>Create another group</button>
            </>
          ) : (
            <>
              <PageTitle
                eyebrow={route === 'party' ? 'ADVENTURING TOGETHER' : 'THE NEXT CHAPTER AWAITS'}
                title={route === 'party' ? 'Your party, at a glance.' : 'Your adventurers'}
                description={
                  route === 'party'
                    ? 'A shared view of the characters around your table.'
                    : 'Pick up where you left off. Every skill, supply, and discovery is here.'
                }
                action={
                  <>
                    <button onClick={() => open('import')}>
                      <Upload size={16} /> Import save
                    </button>
                    <button className="primary" onClick={() => open('create-character')}>
                      <Plus size={16} /> New character
                    </button>
                  </>
                }
              />
              <div className="roster-grid">
                {characters.map((base) => {
                  const c = engine.projected(base);
                  return (
                    <a href={`#character/${c.id}`} className="roster-card" key={c.id}>
                      <div className="roster-top">
                        <Portrait character={c} engine={engine} large />
                        <span className="badge">
                          {c.owner_id === engine.account ? 'YOUR CHARACTER' : 'PARTY MEMBER'}
                        </span>
                      </div>
                      <h2>{c.state.name}</h2>
                      <p>
                        {engine.cache.members.find((m) => m.user_id === c.owner_id)?.display_name ||
                          'Adventurer'}
                      </p>
                      <div className="roster-stats">
                        <span>
                          <b>{Object.values(c.state.skills).reduce((a, s) => a + s.level, 0)}</b>{' '}
                          Total level
                        </span>
                        <span>
                          <b>{c.state.resources.coins || 0}</b> Gold pieces
                        </span>
                        <span>
                          <b>{c.state.cards.length}</b> Cards
                        </span>
                      </div>
                      {route === 'party' && (
                        <div className="party-resources">
                          {Object.entries(c.state.resources).map(([k, v]) => (
                            <span key={k}>
                              {k}: <b>{v}</b>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="roster-footer">
                        Open character sheet <ChevronRight size={16} />
                      </div>
                    </a>
                  );
                })}
                <button className="new-character-card" onClick={() => open('create-character')}>
                  <span>
                    <Plus size={28} />
                  </span>
                  <h3>
                    {characters.length ? 'Another story to tell' : 'Create your first adventurer'}
                  </h3>
                  <p>A new character. A world of possibilities.</p>
                </button>
              </div>
              {host && (
                <section className="session-bar">
                  <div>
                    <Flag size={23} />
                    <div>
                      <h3>Calling it a night?</h3>
                      <p>Save a party checkpoint before packing up.</p>
                    </div>
                  </div>
                  <button disabled={!characters.length} onClick={() => open('finish')}>
                    <Check size={16} /> Finish session
                  </button>
                  <button disabled={!characters.length} onClick={() => backup()}>
                    <Download size={16} /> Group backup
                  </button>
                </section>
              )}
              {route === 'party' && engine.peers.length > 0 && (
                <p className="muted">
                  Connected:{' '}
                  {engine.peers
                    .map((p) => `${p.name}${p.pending ? ` (${p.pending} pending)` : ''}`)
                    .join(', ')}
                </p>
              )}
            </>
          )}
        </main>
        <footer className="workspace-footer">
          Made for the moments between adventures.
          <span>Unofficial companion · Shadow of Elvarg</span>
        </footer>
      </div>
      {modal && (
        <Dialogs
          key={modal.kind}
          modal={modal}
          engine={engine}
          groupId={group?.id || ''}
          close={() => setModal(null)}
          notify={setMessage}
          go={go}
          signedOut={() => setIdentity(null)}
        />
      )}
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{action}</div>
    </div>
  );
}
function Library({
  engine,
  groupId,
  edit,
  host,
}: {
  engine: Engine;
  groupId: string;
  edit: (d: unknown) => void;
  host: boolean;
}) {
  const [search, setSearch] = useState('');
  const cards = engine.cache.cards.filter(
    (c) =>
      c.group_id === groupId &&
      `${c.name} ${c.effects}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-body">
        <input
          className="search"
          aria-label="Search card library"
          placeholder="Search your group’s cards…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="library-grid">
          {cards.map((c) => (
            <article className="held-card" key={c.id}>
              <div className="eyebrow">
                {c.kind} · v{c.revision}
              </div>
              <h3>{c.name}</h3>
              <p className="card-effects">{c.effects}</p>
              <p className="requirements">{c.requirements}</p>
              {host && <button onClick={() => edit(c)}>Edit reference</button>}
            </article>
          ))}
        </div>
        {!cards.length && (
          <Empty title="Your discoveries belong here">
            The host can add accurate card details from your physical collection as you play.
          </Empty>
        )}
      </div>
    </section>
  );
}
