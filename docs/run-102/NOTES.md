# Prototype Run Notes: run-102

## 1. Run
- **Brief**: `briefs/run-102.md`
- **Assigned Port**: `3102` (`http://localhost:3102`)
- **Start**: `make up RUN=102`
- **Seed Command**: `make seed RUN=102` (applies migrations first; safe to repeat)
- **Tests**: `docker compose exec run-102 pnpm test` (the server must be running)

## Progress
- [x] Task 1: Skeleton
- [x] Task 2: Database
- [ ] Task 3: Identity and read path (next)
- [ ] Tasks 4 to 7: see the brief

Tasks are built one at a time, and each is reviewed before the next one starts.

## 2. What it shows
<!-- Filled at wrap-up -->

## 3. Open questions touched
- **Which tool generates OpenAPI from Zod?** Zod 4's own `z.toJSONSchema` with `target: 'openapi-3.0'`. No extra package; about 80 lines assemble the document from the route contracts.

## 4. Added
Layers `core`, `workspace`, `items`, `events`. Route contract, error shape, module registry, OpenAPI builder, and `GET /api/v1`, `/health`, `/openapi.json`.

Tables (task 2): `spaces`, `actors`, `memberships`, `columns`, `items`, `events`, as in the brief. Fixtures: 4 actors, 5 spaces, 20 columns, 19 items, 24 events. Additions to the brief's model:
- `columns` has a unique `(space_id, name)`. `memberships` has no `id` and no `updated_at`, because the pair is its key.
- Every space has a column for each of the four states, so the default column for a new item always exists.
- `items.lead_id` is `ON DELETE SET NULL`.

## 5. Stack assumptions
Nuxt 4.6.3, Zod 4.6.7, Vitest 5.1.0, Drizzle ORM 0.45.4 and drizzle-kit 0.31.11 (exact versions), `pg` 8, `fractional-indexing` 4.0.0. PostgreSQL 16.

## 6. Cut
<!-- Filled at wrap-up -->

## 7. Numbers
- Full test suite: about 11 seconds for 49 tests, of which the database tests create and drop 6 throwaway databases.
- <!-- more at wrap-up -->

## Decisions beyond the brief
- **The middleware, not a catch-all route, owns unknown paths.** A catch-all route did not catch a wrong method on a real path: Nitro's router picked the real path and fell through to the page renderer, so `POST /api/v1/health` returned the HTML welcome page with a 200. The middleware checks every `/api/v1` request against the registry instead. Side effect: a route file without a contract is unreachable, so every route must have a contract.
- **Routes return only what their contract says.** `defineRoute` parses the handler's result with the response schema. This strips extra fields and turns a mismatch into a 500.
- **Wrong method gives 405 with an `Allow` header.** The brief first listed only 400, 401, 403, 404 and 409; 405 was added at review, because it tells a client the path exists. Unknown paths stay 404.

## Task 2 decisions
- **One migration history, not one per layer.** The brief first said each layer's migrations live in the layer. drizzle-kit takes one config and one output folder, and a per-layer split would need an ordered runner and a separate snapshot per layer, with foreign keys across them. The brief now says each layer's *schema* lives in the layer. Adding a layer still touches no existing file: it adds a schema file and a new migration. The cost is that removing a layer needs a migration that drops its tables.
- **The database enforces the item rules.** The foreign key `(space_id, column_id, state)` onto `columns` makes "column in the same space" and "column and state agree" one Postgres rule. The same idea applies to `(space_id, parent_id)`.
- **Events are append-only in the database,** through a trigger (migration `0001`), not only by convention.
- **`COLLATE "C"` on order keys.** The database default is `en_US.utf8`, which sorts `Zz` after `a0`. Fractional keys need byte order, and a test proves it.
- **Postgres code for a `RESTRICT` refusal is `23503`,** the same as a bad reference. I first assumed `23001`; the tests showed otherwise. Task 4 must use the constraint name to tell "bad reference" (400/422) from "still in use" (409).
- **Idle connections:** the pool needs an `error` listener, or a dropped idle connection exits the process.
- **Schema and seed files use relative imports.** drizzle-kit and tsx run outside Nuxt and do not know the `#layers` alias.

## Working notes
- Adding a package: `docker compose exec run-102 pnpm add <package>`. If pnpm refuses with "Unexpected store location", add `--store-dir /root/.local/share/pnpm/store/v11` (the location depends on how `node_modules` was installed).
- Files written by a command in the container belong to root on the host. After `pnpm add`, run `chown` inside the container with the host user's id, or later edits on the host fail.
- Layers and Nitro plugins: file names must be unique across layers (`core.module.ts`, `items.module.ts`), because the same path in two layers means the later one overrides the first.
- The `#layers/<name>` alias is provided by Nuxt inside the app. Vitest has no Nuxt, so `vitest.config.ts` defines it.

## Verification status
Task 2: 49 Vitest tests pass, twice in a row, with no leftover test databases. `make seed RUN=102` inserted 4 actors, 5 spaces, 7 memberships, 20 columns, 19 items and 24 events, and a second run inserted nothing. On a fresh empty database, two seeds started at the same moment applied the 2 migrations once and inserted each row once. A wrong password and an unreachable host each fail with a one-line error (`28P01`, `ENOTFOUND`). Not yet checked: the seeded data through the API (task 3) and in a browser.

Task 1: 20 Vitest tests pass (13 unit, 7 HTTP). In headless Chromium through Playwright the reference page lists all four layers and three routes. The first run showed a hydration mismatch (table without `<tbody>`); after the fix the console has no warnings or errors. Playwright ran from a scratch folder outside the project, so it is not a project dependency. Removing a layer was not tested yet; that is task 7.
