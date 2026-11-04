# Prototype Run Notes: run-101

## 1. Run
- **Brief**: `briefs/run-101.md`
- **Assigned Port**: `3101` (`http://localhost:3101`)
- **Start**: `make up RUN=101`
- **Seed Command**: `make seed RUN=101` (applies migrations, then seeds)
- **Tests**: `docker compose exec run-101 pnpm test` (uses the real database, inside rolled-back transactions)

## Progress
- [x] Task 1: Skeleton
- [x] Task 2: Database
- [ ] Task 3: Identity (next)
- [ ] Tasks 4 to 11: see the brief

Tasks are built one at a time, and each is reviewed before the next one starts.

## 2. What it shows
So far: features can be added as layers, and removing `layers/tree` or `layers/board` removes only that view. The database enforces space boundaries and column/state consistency, whichever client writes.

## 3. Open questions touched
<!-- Filled at wrap-up -->

## 4. Added
Layers `core`, `workspace`, `items`, `sync`, `board`, `tree`, `details`, and the view registry. `sync` and `details` hold only a config file so far.

All six tables from the brief. Added to the brief's model: a `Discarded` column in every space, and fixture actors Cleo and Lurch.

## 5. Stack assumptions
Nuxt 4, Nuxt UI 4.12 with Tailwind CSS 4, `zod` 4, Vitest 5, Drizzle ORM 0.45.4 and drizzle-kit 0.31.11 (exact versions), `fractional-indexing` 4.0.0. Nuxt UI's `Editor` and `DashboardPanel` components exist in this version, for tasks 8 and 11.

## 6. Cut
<!-- Filled at wrap-up -->

## 7. Numbers
<!-- Filled at wrap-up -->

## Changes from the brief
- `getActor()` moves from `core` to `workspace`, agreed with the user on 2026-11-04 before task 3. The brief is left as written; the reason is in `design.md`.

## Working notes
- Adding a package: `docker compose exec run-101 pnpm add --store-dir /root/.local/share/pnpm/store <package>`. Without `--store-dir`, pnpm fails with "Unexpected store location".
- Files written by a command inside the container belong to root on the host. After `pnpm add` or `db:generate`, run `chown` inside the container with the host user's id, or later edits on the host fail. `package.json`, `pnpm-lock.yaml` and `server/db` need it.
- Drizzle wraps driver errors, so task 5 must read the Postgres code and constraint from `error.cause` to turn them into 4xx responses.
- The template's `hmr.clientPort` setting logs a Vite deprecation warning in the server log. The browser console is clean.

## Verification status
Task 1, in headless Chromium through Playwright: `/` lands on the board, the navigation link opens the tree, and the console has no warnings or errors. With `layers/tree` moved away, `/board` returned 200, `/tree` returned 404 and the link was gone. Three Vitest tests cover the registry. Playwright was run from a temporary folder, so it is not a project dependency yet.

Task 1 review, repeated independently: removing `layers/tree` or `layers/board` in turn gave 404 for that view only, and the link went with it. The browser flow still passes, and the app and server type-check clean.

Task 2: on a database emptied by hand, `make seed RUN=101` applied both migrations and inserted 4 spaces, 4 actors, 7 memberships, 17 columns, 19 items and 19 events. Repeating it, including two runs at once, inserted nothing. An unreachable host fails with a readable error after 30 seconds, and a wrong password fails right away. 23 Vitest tests pass, 20 of them against the real database. Applying migrations to an empty database while another seed runs at the same time was not tested. `make init` on a fresh clone was not run, because it would stop the other runs' containers.
