# Prototype Run Notes: run-101

## 1. Run
- **Brief**: `briefs/run-101.md`
- **Assigned Port**: `3101` (`http://localhost:3101`)
- **Start**: `make up RUN=101`
- **Seed Command**: `make seed RUN=101` (still the template's connectivity check until task 2)
- **Tests**: `docker compose exec run-101 pnpm test`

## Progress
- [x] Task 1: Skeleton
- [ ] Task 2: Database (next)
- [ ] Tasks 3 to 11: see the brief

Tasks are built one at a time, and each is reviewed before the next one starts.

## 2. What it shows
Task 1 only: features can be added as layers. Removing `layers/tree` removes its route and navigation link with no other change.

## 3. Open questions touched
<!-- Filled at wrap-up -->

## 4. Added
Layers `core`, `workspace`, `items`, `sync`, `board`, `tree`, `details`, and the view registry. `workspace`, `items`, `sync` and `details` hold only a config file so far.

## 5. Stack assumptions
Nuxt 4, Nuxt UI 4.12 with Tailwind CSS 4, `zod` 4, Vitest 5. Nuxt UI's `Editor` and `DashboardPanel` components exist in this version, for tasks 8 and 11.

## 6. Cut
<!-- Filled at wrap-up -->

## 7. Numbers
<!-- Filled at wrap-up -->

## Working notes
- Adding a package: `docker compose exec run-101 pnpm add --store-dir /root/.local/share/pnpm/store <package>`. Without `--store-dir`, pnpm fails with "Unexpected store location".
- `mongodb` is still in `package.json` because the template's `server/seed.ts` imports it. Remove both in task 2.
- The template's `hmr.clientPort` setting logs a Vite deprecation warning in the server log. The browser console is clean.

## Verification status
Task 1, in headless Chromium through Playwright: `/` lands on the board, the navigation link opens the tree, and the console has no warnings or errors. With `layers/tree` moved away, `/board` returned 200, `/tree` returned 404 and the link was gone. Three Vitest tests cover the registry. Playwright was run from a temporary folder, so it is not a project dependency yet.
