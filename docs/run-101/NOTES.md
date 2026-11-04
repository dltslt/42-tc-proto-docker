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
- `getActor()` moves from `core` to `workspace`, agreed with the user on 2026-11-04 before task 3. The brief's layer table was corrected to match; the reason is in `design.md`.

## Task 5 must do
Found in review on 2026-11-04. The brief's own tests would still pass if these were missed, so they are required.
- **Use a separate test database.** Simultaneous-write tests must really commit, and events cannot be deleted, so running them on `proto_run_101` leaves permanent junk. The tests create and migrate their own database.
- **Test with two real connections.** Simultaneous edits and moves need two connections at once. On a single connection the tests pass without testing anything simultaneous.
- **Handle tied order keys, with a test.** Simultaneous moves can give two siblings the same `position`, and `generateKeyBetween` throws when both neighbours have the same key. The test makes two siblings share a key, drops a card between them and expects no 500.

## Task 7 must do
- **`LISTEN` needs its own connection.** A pooled connection is returned to the pool and loses its subscription. Each server process opens one dedicated `pg.Client`, outside the pool, and reconnects it if it drops.

## Known limits
- **Spaces and actors cannot be deleted.** Events are append-only and have foreign keys to both, so the database refuses. Names and old text also stay in the history, which matters for account deletion and privacy rules. Decide on hiding, anonymising or changing the rule before building any delete for them.
- **A new space needs a column for every state.** Nothing in the database enforces it, only a seed test checks the fixtures. The default column for a new item is the first `unstarted` column, so a space without one would fail on create. Any future "create space" route must create the four default columns in the same transaction.
- **`make seed` is the only way to apply migrations.** After pulling a new migration, run it or the app fails with a database error. The user chose not to add a separate `db:migrate` for this run; a real deployment would need one, so it can update the database without adding demo data.

## Working notes
- Adding a package: `docker compose exec run-101 pnpm add --store-dir /root/.local/share/pnpm/store <package>`. Without `--store-dir`, pnpm fails with "Unexpected store location".
- Files written by a command inside the container belong to root on the host. After `pnpm add` or `db:generate`, run `chown` inside the container with the host user's id, or later edits on the host fail. `package.json`, `pnpm-lock.yaml` and `server/db` need it.
- Drizzle wraps driver errors, so task 5 must read the Postgres code and constraint from `error.cause` to turn them into 4xx responses.
- Type-check: `docker compose exec run-101 pnpm typecheck`. TypeScript is pinned to 5.x because `vue-tsc` 3.3.14 does not work with TypeScript 7. Playwright is still not a dependency: add it with the first browser test (task 6 or 7).
- The template's `hmr.clientPort` setting logs a Vite deprecation warning in the server log. The browser console is clean.

## Verification status
Task 1, in headless Chromium through Playwright: `/` lands on the board, the navigation link opens the tree, and the console has no warnings or errors. With `layers/tree` moved away, `/board` returned 200, `/tree` returned 404 and the link was gone. Three Vitest tests cover the registry. Playwright was run from a temporary folder, so it is not a project dependency yet.

Task 1 review, repeated independently: removing `layers/tree` or `layers/board` in turn gave 404 for that view only, and the link went with it. The browser flow still passes, and the app and server type-check clean. (`typescript` and `vue-tsc` were not installed at the time, so this was re-verified on 2026-11-04 after adding them: `pnpm typecheck` passes, and fails on a deliberate type error.)

Task 2: on a database emptied by hand, `make seed RUN=101` applied both migrations and inserted 4 spaces, 4 actors, 7 memberships, 17 columns, 19 items and 19 events. Repeating it, including two runs at once, inserted nothing. An unreachable host fails with a readable error after 30 seconds, and a wrong password fails right away. 23 Vitest tests pass, 20 of them against the real database. Applying migrations to an empty database while another seed runs at the same time was not tested. `make init` on a fresh clone was not run, because it would stop the other runs' containers.
