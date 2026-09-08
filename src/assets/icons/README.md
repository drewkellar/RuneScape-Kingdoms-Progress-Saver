# Custom skill and resource icons


Put your images in this folder, then rebuild and deploy the app. Missing images use the existing Lucide icons in `src/ui/Icon.tsx`.


Use SVG, WebP, PNG, JPG, or JPEG. Names are case-insensitive and match the saved resource/skill ID: `wood.jpg`, `ore.png`, `flax.webp`, `thieving.jpg`.


Skills: attack (displayed as Melee), ranged, magic, defence, thieving, gathering, crafting, cooking.

Gold pieces: coins. XP: xp. Custom resources use their saved ID (shown when adding the resource).


Use one file per name, preferably a square transparent PNG/WebP or SVG. Aim for 128–256 pixels and under 200 KB. Images keep their aspect ratio and work offline after the updated app is cached. Replacing files requires another build/deployment; browser uploads are only for character portraits.


Default resource filenames: wood, ore, bars, leather, thread, fish, egg, leaves, grain, cherries. Saved legacy/custom resources can also have overrides, including flax.

Aliases: `melee.png` works for Attack/Melee, and `bar.webp` works for Bars. An exact saved-ID filename takes priority if both exist.
