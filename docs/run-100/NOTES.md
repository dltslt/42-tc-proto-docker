# Prototype Run Notes: run-100

## 1. Run
- **Brief**: `briefs/run-100.md` (baseline task tool, built to grow)
- **Assigned Port**: `3100` (`http://localhost:3100`)
- **Start / seed**: `make up RUN=100`, then `make seed RUN=100` (safe to repeat)

## 2. What it shows
The four baseline mechanics run end to end on PostgreSQL: personas and spaces, a recursive item tree,
one-line creation, and a kanban board whose columns and states stay in sync. Future product rules
(permissions, ordering, default column, identity, SQL) each have one place to change, so growth means
replacing a module rather than reshaping the app.

## 3. Open questions touched
- Column vs. state: columns stored on the item and mapped to states in one table works; the server keeps both consistent.
- Board scope: showing all items of a space mixes scales; a per-project filter is the natural next step.
- Ordering: float `position` works for drops but will need rebalancing or fractional indexing.

## 4. Added
- Tables `spaces`, `actors`, `memberships`, `items` (`type`, `description`, `board_column`, `position`, `lead_id`).
- Fixtures: Acme Team (4 actors, "Website relaunch" tree) and Ada's Space ("Dinner party").
- Routes: `GET /api/actors`, `GET|POST /api/items`, `PATCH /api/items/:id`.

## 5. Stack assumptions
Nuxt 4, Nuxt UI 4 + Tailwind CSS 4, PostgreSQL 16 via `pg`, `zod` 4, `@iconify-json/lucide`.

## 6. Cut
Tags, blockers, artifacts, events log, scoring, scheduling, real auth, real-time sync, reparenting, delete,
per-project board filter, automated tests.

## 7. Numbers
Seed: 16 items. SSR page responds with the full board in one request. No load measurements taken.

## Verification status
- Verified: `make seed` twice (counts unchanged); every API case in the brief via curl (create, nested create,
  patch, state/column sync, reorder, 400/401/403/404 cases, cross-space isolation); server-rendered board
  confirmed in a headless Firefox screenshot.
- **Not verified in a real browser:** drag-and-drop, the editor dialog, the quick-add inputs, tree
  toggles and the persona/space switch. No browser automation was available in this session, so these
  "Done when" items (2-6) were only checked through their API calls and the server render.
