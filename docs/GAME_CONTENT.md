# Provisional content and verification checklist

The user’s physical released rules are the authority. The character sheet was supplied on September 7, 2026 and now determines the online sheet layout, skill labels, two XP slots, cape objectives, and side-quest reference text. The complete released XP rules paragraph is still needed to finalize automated progression.

Sources consulted:

- [Publisher skill tutorial](https://steamforged.com/blogs/brands/skills-in-runescape-board-game): describes three XP per level, removing XP on leveling, and maximum skill level 99. Originally published in 2022; this is not proof of unchanged release rules.
- [Released rulebook product](https://steamforged.com/en-gb/products/runescape-kingdoms-shadow-of-elvarg-rulebook-pdf): the download requires the publisher's zero-cost checkout. No checkout was performed.
- A distributor-hosted rulebook draft shows character skill tracks, wounds, death tally, cape objectives, and side-quest tally. Draft markings mean it is supporting evidence only.

Decisions in this build:

- Stable internal skill IDs: attack, ranged, magic, defence, thieving, gathering, crafting, cooking. Attack is displayed as “Attack / Melee” to match the user's terminology and the source. Do not silently change IDs in existing saves.
- New characters start with blank bookkeeping (level 1 and zero resources/XP), not an asserted legal starting loadout. Players correct values from the physical sheet.
- Only coins and wood appear initially. Additional counters are explicitly user-selected suggestions or custom labels; verify token types and food distinctions before adopting a canonical resource catalog.
- Automated progression requires explicit per-character confirmation, with a documented maximum-level XP behavior. It does not award other benefits, enforce physical token supply, apply combat rules, resolve card effects, or automatically claim capes.
- Card content is entered into a private group library. No full published card catalog is bundled.

Before finalizing the base ruleset, compare the physical sheet and released XP paragraph, confirm the skill names, resource/food types, XP boundary behavior, and any required per-character fields. Then add a versioned ruleset migration and matching SQL/client tests. Preserve existing saved values and downloadable imports.
