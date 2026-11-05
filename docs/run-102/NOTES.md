# Prototype Run Notes: run-102

## 1. Run
- **Brief**: `briefs/run-102.md`
- **Assigned Port**: `3102` (`http://localhost:3102`)
- **Start**: `make up RUN=102`
- **Seed Command**: `make seed RUN=102` (nothing to seed until task 2)
- **Tests**: `docker compose exec run-102 pnpm test` (the server must be running)

## Progress
- [x] Task 1: Skeleton
- [ ] Task 2: Database (next)
- [ ] Tasks 3 to 7: see the brief

Tasks are built one at a time, and each is reviewed before the next one starts.

## 2. What it shows
<!-- Filled at wrap-up -->

## 3. Open questions touched
- **Which tool generates OpenAPI from Zod?** Zod 4's own `z.toJSONSchema` with `target: 'openapi-3.0'`. No extra package; about 80 lines assemble the document from the route contracts.

## 4. Added
Layers `core`, `workspace`, `items`, `events` (only `core` has code). Route contract, error shape, module registry, OpenAPI builder, and `GET /api/v1`, `/health`, `/openapi.json`.

## 5. Stack assumptions
Nuxt 4.6.3, Zod 4.6.7, Vitest 5.1.0. Drizzle is added in task 2.

## 6. Cut
<!-- Filled at wrap-up -->

## 7. Numbers
<!-- Filled at wrap-up -->

## Decisions beyond the brief
- **The middleware, not a catch-all route, owns unknown paths.** A catch-all route did not catch a wrong method on a real path: Nitro's router picked the real path and fell through to the page renderer, so `POST /api/v1/health` returned the HTML welcome page with a 200. The middleware checks every `/api/v1` request against the registry instead. Side effect: a route file without a contract is unreachable, so every route must have a contract.
- **Routes return only what their contract says.** `defineRoute` parses the handler's result with the response schema. This strips extra fields and turns a mismatch into a 500.
- **Wrong method gives 404, not 405.** The brief lists only 400, 401, 403, 404 and 409.

## Working notes
- Adding a package: `docker compose exec run-102 pnpm add --store-dir /root/.local/share/pnpm/store/v11 <package>`. Without `--store-dir`, pnpm refuses with "Unexpected store location".
- Files written by a command in the container belong to root on the host. After `pnpm add`, run `chown` inside the container with the host user's id, or later edits on the host fail.
- Layers and Nitro plugins: file names must be unique across layers (`core.module.ts`, `items.module.ts`), because the same path in two layers means the later one overrides the first.
- The `#layers/<name>` alias is provided by Nuxt inside the app. Vitest has no Nuxt, so `vitest.config.ts` defines it.

## Verification status
Task 1: 20 Vitest tests pass (13 unit, 7 HTTP). In headless Chromium through Playwright the reference page lists all four layers and three routes. The first run showed a hydration mismatch (table without `<tbody>`); after the fix the console has no warnings or errors. Playwright ran from a scratch folder outside the project, so it is not a project dependency. Removing a layer was not tested yet; that is task 7.
