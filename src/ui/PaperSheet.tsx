import { Plus, ImagePlus } from 'lucide-react';
import { useState } from 'react';
import { skills, labels } from '../domain/model';
import type { Character, State } from '../domain/model';
import type { Engine } from '../data/engine';
import { Portrait } from './Sheet';
import { Counter } from './components';
import Icon from './Icon';
import SkillBadge from './SkillBadge';
import './paper-sheet.css';

const objectives = [
  'Reach level 8 in any skill.',
  'Reach level 3 in eight skills.',
  'Have 15 coins.',
  'Have one of each of the 12 resources.',
  'Complete 4 side quests.',
];
const benefits = [
  [3, 'When this adventurer completes a side quest, they gain one XP in a skill of their choice.'],
  [5, 'This adventurer can suffer one additional wound before dying.'],
  [8, 'This adventurer can teleport without discarding a GP.'],
  [
    12,
    'This adventurer can equip one additional equipment card during a boss fight, of a type of their choice.',
  ],
] as const;

export default function PaperSheet({
  background,
  character: c,
  engine,
  run,
  edit,
}: {
  background: 'image' | 'generated';
  character: Character;
  engine: Engine;
  run: (fn: () => Promise<unknown>) => void;
  edit: (kind: string) => void;
}) {
  const s = c.state,
    editable = engine.canEdit(c);
  const [pendingObjectives, setPendingObjectives] = useState<Record<string, boolean>>({});
  const change = (state: State, label: string) =>
    run(() => engine.enqueue(c, { kind: 'replace', state }, label));
  const resource = (key: string, delta: number) =>
    run(() =>
      engine.enqueue(
        c,
        { kind: 'resource', key, delta },
        `${delta > 0 ? '+' : ''}${delta} ${labels[key] || key}`,
      ),
    );
  const xp = (key: (typeof skills)[number], delta: number) =>
    run(() =>
      engine.enqueue(
        c,
        { kind: 'xp', key, delta },
        `${delta > 0 ? '+' : ''}${delta} ${labels[key]} XP`,
      ),
    );
  const markObjective = (text: string) => {
    const line = `✓ ${text}`;
    const notes = s.capeNotes.split('\n');
    const checked = !notes.includes(line);
    setPendingObjectives((pending) => ({ ...pending, [text]: checked }));
    const next = {
      ...s,
      capeNotes: notes.includes(line)
        ? notes.filter((n) => n !== line).join('\n')
        : [...notes.filter(Boolean), line].join('\n'),
    };
    run(async () => {
      try {
        await engine.enqueue(c, { kind: 'replace', state: next }, 'Updated cape objective');
      } finally {
        setPendingObjectives((pending) => {
          const remaining = { ...pending };
          delete remaining[text];
          return remaining;
        });
      }
    });
  };
  const supply = (key: string, value: number) => (
    <div className="resource paper-resource" key={key}>
      <Icon name={key} />
      <span>{key === 'coins' ? 'Gold pieces' : labels[key] || key}</span>
      <Counter
        label={labels[key] || key}
        value={value}
        disabled={!editable}
        onChange={(d) => resource(key, d)}
      />
    </div>
  );
  return (
    <section
      className={`physical-frame ${background === 'image' ? 'image-parchment' : ''}`}
      aria-label="Character sheet matching the printed game sheet"
    >
      <div className="parchment-sheet">
        <div className="paper-records">
          <section className="paper-name">
            <h2 className="ribbon">Name</h2>
            <div className="name-and-portrait">
              <div className="name-line">
                <h1>{s.name}</h1>
                <button
                  disabled={!editable}
                  onClick={() => edit('correction')}
                  className="paper-edit"
                >
                  Edit character
                </button>
              </div>
              <button
                className="paper-portrait"
                disabled={!editable}
                onClick={() => edit('portrait')}
                aria-label="Change character portrait"
              >
                <Portrait character={c} engine={engine} large />
                <span>
                  <ImagePlus size={13} /> Portrait
                </span>
              </button>
            </div>
          </section>
          <section className="paper-wounds">
            <h2 className="ribbon">Wounds</h2>
            <div className="wound-slots">
              {Array.from({ length: s.sideQuests >= 5 ? 4 : 3 }, (_, i) => (
                <button
                  key={i}
                  className={`wound-token ${s.wounds > i ? 'marked' : ''}`}
                  aria-label={`${s.wounds > i ? 'Remove' : 'Add'} wound ${i + 1}`}
                  aria-pressed={s.wounds > i}
                  disabled={!editable}
                  onClick={() =>
                    change(
                      { ...s, wounds: Math.max(0, s.wounds + (s.wounds > i ? -1 : 1)) },
                      'Updated wounds',
                    )
                  }
                >
                  <span>✹</span>
                </button>
              ))}
            </div>
            <small>
              {s.wounds} wounds{s.wounds > 4 ? ' · adjust in adventure details' : ''}
            </small>
          </section>
          <section className="paper-deaths">
            <h2 className="ribbon">Death Tally</h2>
            <div className="paper-tally">
              <Counter
                label="deaths"
                value={s.deaths}
                disabled={!editable}
                onChange={(d) => change({ ...s, deaths: s.deaths + d }, 'Updated death tally')}
              />
            </div>
          </section>
          <section className="paper-capes">
            <h2 className="ribbon">Cape Objectives</h2>
            <div className="cape-objectives">
              {objectives.map((text) => (
                <label key={text}>
                  <input
                    type="checkbox"
                    checked={
                      pendingObjectives[text] ?? s.capeNotes.split('\n').includes(`✓ ${text}`)
                    }
                    disabled={!editable || Object.hasOwn(pendingObjectives, text)}
                    onChange={() => markObjective(text)}
                  />
                  <span>{text}</span>
                </label>
              ))}
            </div>
          </section>
          <section className="paper-quests">
            <h2 className="ribbon">Side Quests Completed</h2>
            <div className="paper-tally">
              <Counter
                label="sideQuests"
                value={s.sideQuests}
                disabled={!editable}
                onChange={(d) =>
                  change({ ...s, sideQuests: s.sideQuests + d }, 'Updated side quests')
                }
              />
            </div>
            <div className="quest-benefits">
              {benefits.map(([count, text]) => (
                <div key={count} className={s.sideQuests >= count ? 'unlocked' : ''}>
                  <span className="reference-number">{count}</span>
                  <p>{text}</p>
                </div>
              ))}
            </div>
            <section className="paper-gp">
              <h2 className="ribbon">GP</h2>
              {supply('coins', s.resources.coins || 0)}
            </section>
          </section>
          <section className="paper-supplies">
            <h2 className="ribbon">Resources</h2>
            <div className="paper-resources">
              {Object.entries(s.resources)
                .filter(([k]) => k !== 'coins')
                .map(([k, v]) => supply(k, v))}
            </div>
            {editable && (
              <button className="paper-edit" onClick={() => edit('resource')}>
                <Plus size={13} /> Add resource
              </button>
            )}
          </section>
        </div>
        <section className="paper-skills">
          <h2 className="ribbon">Skills</h2>
          <div className="paper-skill-list">
            {skills.map((k) => (
              <div key={k} className={`paper-skill skill-${k}`}>
                <SkillBadge skill={k} />
                <button
                  className="paper-level"
                  aria-label={`Correct ${labels[k]} level, currently ${s.skills[k].level}`}
                  disabled={!editable}
                  onClick={() => edit('correction')}
                >
                  {s.skills[k].level}
                </button>
                <div className="xp-track paper-xp" aria-label={`${s.skills[k].xp} XP`}>
                  {[0, 1].map((i) => (
                    <button
                      key={i}
                      className={`xp-slot ${s.skills[k].xp > i ? 'filled' : ''}`}
                      disabled={!editable || (s.autoLevel && s.skills[k].level === 99)}
                      aria-pressed={s.skills[k].xp > i}
                      aria-label={`${s.skills[k].xp > i ? 'Remove' : 'Mark'} ${labels[k]} XP token ${i + 1}`}
                      onClick={() => xp(k, s.skills[k].xp > i ? -1 : 1)}
                    >
                      <span>XP</span>
                    </button>
                  ))}
                </div>
                <button
                  className="paper-award"
                  disabled={!editable || (s.autoLevel && s.skills[k].level === 99)}
                  aria-label={`Add 1 ${labels[k]} XP`}
                  title="Award 1 XP"
                  onClick={() => xp(k, 1)}
                >
                  <Plus size={13} />
                </button>
              </div>
            ))}
          </div>
        </section>
        <aside className="paper-reference">
          <h2 className="ribbon">Turn Reference</h2>
          <ol className="turn-steps">
            <li>
              <span className="reference-number">1</span> Move or Teleport
            </li>
            <li>
              <span className="reference-number">2</span> Action or Explore
            </li>
            <li>
              <span className="reference-number">3</span> Bonus Action
            </li>
          </ol>
          <p>
            <b>Reminder:</b> If an adventurer ends their turn in a capital region, they must{' '}
            <b>advance the escalation track +1.</b>
          </p>
          <p>
            <b>Reminder:</b> While an adventurer is in a capital, they may place any number of
            components from their inventory into the <b>clan bank.</b> They may also take any number
            of components from the clan bank and add them to their inventory.
          </p>
          <h2 className="ribbon">Exploring a Province</h2>
          <ul className="reference-checks">
            <li>
              You must draw an <b>exploration card</b> and resolve the section that corresponds to
              the region you are in.
            </li>
            <li>
              You may <b>forage or skill,</b> depending on which icon the region shows.
            </li>
          </ul>
          <h2 className="ribbon">Exploring a Capital</h2>
          <ul className="reference-checks">
            <li>
              You may gain <b>one XP</b> in each different skill shown by discarding the
              corresponding number of GP.
            </li>
            <li>
              You may <b>forage.</b>
            </li>
          </ul>
          <div className="paper-wordmark">
            <span>RuneScape</span>
            <strong>Kingdoms</strong>
            <small>Shadow of Elvarg</small>
          </div>
        </aside>
      </div>
    </section>
  );
}
