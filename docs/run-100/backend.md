# Backend Architecture: run-100

## Server Endpoints
Nitro routes in `server/api/` (file name = route). Item routes require header `x-actor-id`.

- `GET /api/actors`: `{ actors: [{id,name,kind,space_ids}], spaces: [{id,name,type,member_ids}] }`.
- `GET /api/items?space_id=`: items of the space, ordered by column then position. 401 without identity, 403 if not a member.
- `POST /api/items`: body `{ space_id, title, parent_id?, type?, board_column? }`. Returns 201 and the item.
  Child type defaults from the parent (project > epic > story > task); column defaults to the first `unstarted` column.
- `PATCH /api/items/:id`: body any of `title, description, type, state, board_column, before_id, lead_id`.
  Sending a column implies its state and vice versa; `before_id` places the item before another in the target column.
  404 for unknown items and for items in spaces the actor does not belong to.

## Database Integration
- Tables: `spaces`, `actors`, `memberships (space_id, actor_id)`, `items`. CHECK constraints on enums, indexes on
  `items(space_id)` and `items(parent_id)`, `ON DELETE CASCADE` along the hierarchy.
- All item SQL is in `server/utils/items.ts`, parameterized. DDL is in `server/utils/schema.ts`.
- `server/seed.ts` is idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`): 2 spaces, 4 actors, 16 items.
  Note: re-seeding never overwrites rows you edited.

## Validation & Error Handling
- `server/utils/schemas.ts` (zod) validates every query/body; `.strict()` on PATCH rejects unknown keys.
- Failures become `createError` with 400 and a readable `message` (e.g. `title: must not be empty`),
  never a 500. Invalid JSON gives 400 as well.

## Tests
`docker compose exec run-100 pnpm test` (after `make seed RUN=100`). Vitest integration tests in `tests/` call the
running dev server over HTTP, like the browser does, and remove the items they create directly in Postgres:
- `seed.test.ts`: fixtures, hierarchy chain, ordering, column/state consistency.
- `access.test.ts`: 401/403/404 and space isolation.
- `items.test.ts`: creation defaults, column/state sync, drop ordering, lead rules, validation errors.
