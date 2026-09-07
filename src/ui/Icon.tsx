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
  hide: Beef,
  flax: Wheat,
  herbs: Leaf,
  rawFish: Fish,
  food: CookingPot,
  xp: Sparkles,
};
export default function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const Component = icons[name as keyof typeof icons] || Package;
  return <Component size={size} strokeWidth={1.7} aria-hidden="true" />;
}
