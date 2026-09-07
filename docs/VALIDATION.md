# Initial release verification

## Automated checks

- `npm test`: 21 tests covering pure progression/validation, offline queue durability and replay, crash-after-ack recovery, account cache isolation, actual PostgreSQL transaction functions and RLS, retry deduplication, host vs player vs outsider access, stale replacements, undo, group checkpoints, failed import rollback, campaign archiving, revoked invitations, and private portrait object policies.
- `npm run build`: TypeScript and production Vite build, including generated service worker and precache manifest.
- `npm run test:e2e`: headless Edge exercises character creation, wood/XP awards, reload, undo, checkpoint restore, JSON export/import, mobile overflow, deep links, production offline reload and local edits, card references, portrait crop/upload to local storage, ZIP export, and a print summary independent of the selected screen tab.
- Visual review: desktop character sheet screenshot and 390-pixel viewport overflow check.

The SQL tests execute in embedded PostgreSQL (PGlite), with test-only auth/storage/realtime schemas. This verifies policies and transaction code, **not** Supabase's actual OAuth flow, object service, or websocket infrastructure. Realtime publication registration is excluded from the embedded harness because it has no Supabase replication service.

## Live acceptance still required

1. Apply migrations to a fresh Supabase project; enable Discord login and configure redirects and frontend variables.
2. Sign in as host and player in separate browser profiles, plus an unrelated third account. Confirm invitations and privacy boundaries, including portraits.
3. Add 2 wood and 1 XP on the player sheet; confirm the host sees it without refresh. Make a host edit and confirm both clients agree.
4. Disconnect the player, change a value, then reconnect. Verify once-only replay and visible conflicts for stale replacements.
5. Verify portrait upload/read/removal in actual Supabase Storage and group presence during Finish session.
6. Confirm the printed rules and all character fields; only then enable automatic progression.
7. Play one full group session, finish it, download a ZIP/JSON backup, and resume from the recorded state next session.

No full group play session or live Supabase integration is claimed by the automated results.
