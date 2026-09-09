import { useState } from 'react';
import { labels, type skills } from '../domain/model';
import Icon from './Icon';

const files = import.meta.glob('../assets/skill-badges/*.{svg,webp,png,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const badges = Object.fromEntries(
  Object.entries(files)
    .sort()
    .map(([path, url]) => [
      path
        .split('/')
        .pop()!
        .replace(/\.[^.]+$/, '')
        .toLowerCase(),
      url,
    ]),
);

export default function SkillBadge({ skill }: { skill: (typeof skills)[number] }) {
  const name = skill === 'attack' ? 'Melee' : labels[skill];
  const src = badges[skill] || (skill === 'attack' ? badges.melee : undefined);
  const [failed, setFailed] = useState<string>();
  if (src && failed !== src)
    return (
      <div className="skill-seal complete-skill-badge">
        <img src={src} alt={name} onError={() => setFailed(src)} />
      </div>
    );
  return (
    <div className="skill-seal">
      <span>
        <Icon name={skill} size={29} />
      </span>
      <b>{name}</b>
    </div>
  );
}
