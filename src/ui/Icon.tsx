import { useState } from 'react';
import {
  Swords,
  Crosshair,
  WandSparkles,
  Shield,
  Hand,
  Axe,
  Hammer,
  CookingPot,
  Coins,
  TreePine,
  Mountain,
  Leaf,
  Fish,
  Wheat,
  Beef,
  Sparkles,
  Package,
  BrickWall,
  Cable,
  Egg,
  Cherry,
} from 'lucide-react';
const icons = {
  attack: Swords,
  ranged: Crosshair,
  magic: WandSparkles,
  defence: Shield,
  thieving: Hand,
  gathering: Axe,
  crafting: Hammer,
  cooking: CookingPot,
  coins: Coins,
  wood: TreePine,
  ore: Mountain,
  bars: BrickWall,
  leather: Beef,
  thread: Cable,
  fish: Fish,
  egg: Egg,
  leaves: Leaf,
  grain: Wheat,
  cherries: Cherry,
  hide: Beef,
  flax: Wheat,
  herbs: Leaf,
  rawFish: Fish,
  food: CookingPot,
  xp: Sparkles,
};
// Vite includes named overrides at build time; missing files keep the line-art icon.
const imageFiles = import.meta.glob('../assets/icons/*.{svg,webp,png,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const customIcons = Object.fromEntries(
  Object.entries(imageFiles)
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
export default function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const src = customIcons[name.toLowerCase()];
  const [failed, setFailed] = useState<string>();
  if (src && failed !== src)
    return (
      <img
        className="custom-game-icon"
        src={src}
        width={size}
        height={size}
        alt=""
        onError={() => setFailed(src)}
      />
    );
  const Component = icons[name as keyof typeof icons] || Package;
  return <Component size={size} strokeWidth={1.7} aria-hidden="true" />;
}
