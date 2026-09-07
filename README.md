# Kingdoms Character Companion

A desktop-first, unofficial RuneScape Kingdoms: Shadow of Elvarg character companion. React + TypeScript + Vite, Supabase, and GitHub Pages. No paid services or scheduled keep-alive jobs.

## Run locally

Requires Node.js 22 and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite and choose **Try on this device**. Local mode uses IndexedDB, supports multiple characters, cards, undo, checkpoints, imports, exports, and portraits. It is explicitly separate from Discord accounts. Export and import to move local characters into a connected group. Clearing browser data deletes local saves; download backups.

```sh
npm test
npm run build
npm run test:e2e
```

Browser tests use installed Microsoft Edge in headless mode and require `npm run build` first. They start development and production preview servers on ports 4173 and 4174. Production output is `dist/`. Preview a production build with `npm run preview`. The service worker is enabled in production, not development. Previously loaded application files work offline; first-time login and new cloud characters require a connection.

## Connect Supabase and Discord

1. Create a free Supabase project. Apply the SQL files in `supabase/migrations/` in numerical order to a **new project** using its SQL editor, or link the Supabase CLI and run `supabase db push`. Do not rerun initial migrations over an existing deployment.
2. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications). Add the OAuth redirect shown by Supabase: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`. A Discord bot is not required.
3. In Supabase Authentication → Providers → Discord, enable the provider and enter its client ID and client secret. Keep the Discord secret in Supabase only.
4. In Supabase Authentication → URL Configuration, set Site URL to your app's exact origin and base path, e.g. `https://USERNAME.github.io/REPOSITORY/`. Add that exact URL and the local development URL `http://127.0.0.1:5173/` to the allowed redirects. The app uses PKCE and handles the callback at the site root, then uses hash routes for character links.
5. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` and the project's publishable/anon key as `VITE_SUPABASE_ANON_KEY`. **Never use a service-role/secret key in any `VITE_` variable.** Restart Vite after changing configuration.
6. Sign in, create a group, and create an invitation in Group & campaigns. Friends sign in with Discord and open the link. Invitations last seven days and are revocable. Group data is private even though the static app is public.

Reference: [Supabase Discord login](https://supabase.com/docs/guides/auth/social-login/auth-discord).

## GitHub Pages deployment

The repository is [drewkellar/RuneScape-Kingdoms-Progress-Saver](https://github.com/drewkellar/RuneScape-Kingdoms-Progress-Saver). `.github/workflows/pages.yml` contains the deployment workflow. Supabase configuration must be supplied separately.

1. Create/select a GitHub repository, add this source, and push a `main` branch.
2. In repository Settings → Pages, select **GitHub Actions** as the source.
3. Set repository Actions variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optionally `VITE_BASE_PATH`. The workflow defaults the path to `/REPOSITORY/`; use `/` for a custom domain or user Pages repository.
4. Push to `main` or run **Validate and deploy Pages**. It runs unit/database tests, builds, and deploys. Pull requests validate without deploying.
5. Verify Discord login at the production URL. Without Supabase variables the build remains a functional, clearly labeled local-only app.

Character routes use `#character/UUID`, so direct links and refreshes work on Pages without server rewrite rules. Production updates activate when existing tabs close; the app avoids forcing a refresh during unsaved typing.

## Save and recovery behavior

- Each completed action is written to an account-scoped IndexedDB queue before submission. A single SQL transaction checks access, applies the action, records its author and previous state, and increments the character revision.
- Resource and XP deltas apply against current server values. Whole-state edits and undo/restore require the expected revision. Action UUIDs prevent retry duplicates. The queue remains until the authoritative snapshot includes the action.
- A conflicting action blocks dependent changes for that character, but other characters may sync. The review dialog preserves the operation, offers a pending-action download, and requires an explicit discard of that action and its dependent queue. Reapply a correction after reviewing current state.
- Undo reverses only the latest character action and appends a new history record. Explicit corrections and checkpoint restores save the previous state first.
- Automatic checkpoints are generated on the next confirmed action after ten minutes, retaining the most recent 100 per character. Session and recovery checkpoints persist until explicitly deleted.
- Finish session serializes against group character writes using a group-row lock. This records only server-confirmed state. Presence is advisory and cannot discover offline players or guarantee their queues are empty.
- JSON backups include current character state and the referenced custom card definitions. Portraits produce a ZIP with JSON and WebP files. Pending action intent can be downloaded separately from a conflict dialog; ordinary exports include projected state and an unconfirmed-change count.
- Imports validate structure/version, preview their contents, and copy card IDs to avoid cross-group collisions. New references require a host. Character/card import is transactional; portrait uploads happen afterward and failures are reported separately. Portable backups preserve current state, not the entire historical action/checkpoint database. Restore and import never restore accounts or permissions from a file.

## When Supabase pauses

Before game night open your Supabase dashboard, select the project, and click **Resume project** if paused. Wait for it to become available and use the app's retry button. GitHub Pages remains available independently. Existing cached characters can be edited offline; shared updates and sign-in resume when the backend is available. The app does not guess that every connection problem means pausing.

Download a group backup after each session and keep a copy outside Supabase. Free projects are not an independent backup service. See the [current pausing policy](https://supabase.com/docs/guides/platform/free-project-pausing) for restoration time limits.

## Game-content verification required

This first release is marked **provisional**, not an authoritative rules engine. See `docs/GAME_CONTENT.md`. Automatic progression is off by default; it can be explicitly enabled after comparing the displayed rule to your released physical rules. Resource suggestions are configurable and are not presented as a verified complete token inventory. No card effects, starting equipment, or rewards have been invented. Your host enters card reference text as you play.

## Architecture and next modules

- `src/domain/`: versioned game data, validation, pure transitions.
- `src/data/`: account-scoped storage, queue/sync engine, backup validation and image processing.
- `src/ui/`: desktop sheet, party view, card library, dialogs, responsive/print styles.
- `supabase/migrations/`: table permissions, transaction RPCs, invitation handling, private portrait policies, group presence, import transaction.
- Campaign identity and roster are independent of character lifetime. A future board module should use a separate campaign-state table and revision stream; it should not add board state to character actions. Expansions should introduce explicit ruleset versions and migrations for old exports.

### Release status

Local implementation and automated checks are available. Live Discord/Supabase configuration, production two-account realtime/storage checks, released rulebook comparison, and a full group play session are required before calling this stable. No production deployment or real multi-person game session is claimed by the local test results.
