# Backend Architecture: run-102

## Server Endpoints
All routes live under `/api/v1`. Route files are in `layers/<name>/server/api/v1/`; the file path decides the URL. Every route except the open ones needs an `X-Actor-Id` header.

| Route | Layer | Actor | Purpose |
|---|---|---|---|
| `GET /api/v1` | core | open | Contract version, the loaded layers, and the actions each one checks |
| `GET /api/v1/health` | core | open | `{ "status": "ok" }` |
| `GET /api/v1/openapi.json` | core | open | The API described in OpenAPI 3.0, built from the contracts |
| `GET /api/v1/actors` | workspace | open | Actors, so a client can choose who to act as |
| `GET /api/v1/spaces` | workspace | needed | Only the spaces the caller is a member of |
| `GET /api/v1/spaces/:id/columns` | workspace | needed | Columns of a space in board order (404 unknown space, 403 not a member) |
| `GET /api/v1/spaces/:id/events` | events | needed | The event log of a space, oldest first, with filters and `?after=<event id>` (404 unknown space, 403 not a member) |
| `GET /api/v1/spaces/:id/tags` | tags | needed | Tags of a space, sorted by name |
| `POST /api/v1/tags` | tags | needed | Create a tag (409 if the name exists in the space, ignoring case). 201 |
| `DELETE /api/v1/tags/:id` | tags | needed | Delete a tag and its links |
| `GET /api/v1/tags/:id/items` | tags | needed | Ids of the items with this tag |
| `GET /api/v1/items/:id/tags` | tags | needed | Ids of an item's tags |
| `PUT /api/v1/items/:id/tags/:tag_id` | tags | needed | Tag an item (400 if the tag is from another space) |
| `DELETE /api/v1/items/:id/tags/:tag_id` | tags | needed | Remove the tag from the item |
| `GET /api/v1/items?space_id=` | items | needed | Items of a space, with filters, search, sorting and cursor pagination |
| `GET /api/v1/items/:id` | items | needed | One item (404 unknown, 403 if it lives in a space the caller is not in) |
| `POST /api/v1/items` | items | needed | Create an item: `space_id` and `title` are enough. 201 |
| `PATCH /api/v1/items/:id` | items | needed | Edit fields. Text fields need `expected_version` |
| `POST /api/v1/items/:id/move` | items | needed | Change parent, column and place among the siblings in one step |
| `DELETE /api/v1/items/:id` | items | needed | Delete; with children, `?mode=subtree` or `?mode=lift` |

Any other `/api/v1` request gets the error shape: 405 with an `Allow` header when the path exists for other methods, 404 when it does not.

### Lists
Every list answers `{ "data": [...], "next_cursor": "..." | null }`. Pass `next_cursor` back as `?cursor=` for the next page; `null` means the end. `?limit=` is 1 to 200 (default 50). The cursor is opaque and tied to the sort it came from.

`GET /items` filters: `state`, `type`, `column_id`, `lead_id`, `parent_id` (an item id, or `null` for root items) and `q` (case-insensitive text in the title or description; `%` and `_` are plain characters). Sort with `?sort=position`, `-position`, `created_at` or `-created_at`; ties are broken by id. Discarded items are returned like any other: hiding them is the client's choice.

### Event log
`GET /spaces/:id/events` answers `{ data, next_cursor }` like other lists, but pages by event id instead of an opaque cursor. Events come oldest first. `?after=<id>` returns exactly the events with a bigger id, and `next_cursor` (the last id on the page, or `null`) goes back as `?after=`. A client that polls keeps the last id it saw and asks for what is new. Filters: `type`, `target_kind`, `target_id`. Events with no space are not reachable here. `changes` holds `{ field: { from, to } }` for the fields that changed; `version` is not part of it.

### Writes
Every write is one transaction that saves the change **and its event** together. `layers/items/server/services/write.ts` holds the rules; the route files only validate and call it.

- **One writer per space.** A write first takes a lock on its space (`lockSpace`) and holds it until it commits. Writes inside one space run one after another; reads and other spaces are not affected. This is what makes the cycle check, the version check and the order keys safe, and it keeps event ids in commit order.
- **Create:** `space_id` and `title`. The item goes to the end of its siblings, in the first column of the requested state (default `unstarted`). Optional: `description`, `type`, `parent_id`, `column_id`, `state`, `lead_id`. A column and a state given together must agree.
- **Edit (`PATCH`):** send only what changed. `title`, `description`, `type` and `lead_id` are *versioned*: the request must carry `expected_version`, and a mismatch is a **409 whose `error.current` is the stored item**, so a client can show both versions. A successful edit raises `version` by one. Saving the same value again changes nothing and writes no event. `state` is not versioned: it moves the item to the first column of that state, last write wins.
- **Move:** `parent_id` (null = root), `column_id` and a place, `after_id` or `before_id` (a sibling). Omitted fields stay as they are; with no neighbour the item goes to the end of the siblings. A move never checks or raises `version`, so it cannot conflict with a text edit. Moving an item under itself or a descendant is a **409**. Clients never see order keys being computed: they name a neighbour.
- **Order keys:** every item has one total order among its siblings (same parent), and a column shows the items of that column in that order. Two siblings can end up with the same key; the move then gives the tied siblings after the gap fresh keys (one `item.moved` event each) instead of failing.
- **Delete:** an item with children and no `mode` is a **409**. `mode=subtree` deletes the item and all its descendants. `mode=lift` moves the children up one level into the place the item had, then deletes it. The answer lists `deleted_ids` and `lifted_ids`.
- **Events written** (type, what `changes` holds as `{ from, to }`): `item.created` (the initial fields), `item.updated` (title, description, type, lead_id, state, column_id), `item.moved` (parent_id, column_id, state, position), `item.deleted` (the removed fields). A subtree delete writes one `item.deleted` per item; a lift writes one `item.moved` per child. A write that changes nothing writes nothing.
- **Rejected input** is a 400 with the field named: unknown fields (the body schemas are strict), a title that is empty, over 200 characters or on several lines, a parent, column or neighbour from another space, a lead who is not a member.

### Who is calling
`getActor()` (workspace layer) reads the `X-Actor-Id` header and looks the actor up. A missing, malformed or unknown id is a 401. The header is not security: anyone can send any id. Real login or API keys replace this one function. The route wrapper in `core` calls it through a hook that the workspace layer sets at server start, so `core` never imports a layer above it.

### Two separate checks
- **Space isolation** is a data rule that the services always enforce: an actor only touches spaces they are a member of (`requireSpaceAccess`). It does not depend on `can()`.
- **`can(actor, action, resource)`** is the policy hook. It allows everything today. Each layer lists the action names it checks (`item.list`, `item.read`, `space.list`, `column.list`), and `can()` throws on a name no layer registered, so a typo is never quietly allowed.

## How a request flows
1. `layers/core/server/middleware/api-v1.ts` runs first. It looks the method and path up in the registry (`matchRoute`).
2. A match continues to the route file. No match ends the request with a 405 (path known, other method) or 404.
3. `defineRoute` identifies the caller (`getActor()`), validates params, query and body with the contract's Zod schemas, calls the handler, then checks the handler's result against the response schema.
4. The handler calls `authorize(actor, action, resource)` and a service. Services take the database handle as their first argument, so tests can pass a throwaway database.

## Database Integration
PostgreSQL 16 through Drizzle ORM. Each layer owns the tables it introduces, in `layers/<name>/server/db/schema.ts`. A layer imports tables only from layers below it. One `drizzle.config.ts` collects every schema file and writes one ordered migration history to `drizzle/`.

| Layer | Tables |
|---|---|
| workspace | `spaces`, `actors`, `memberships`, `columns` |
| items | `items` |
| events | `events` |

Conventions: uuid ids generated by Postgres, snake_case, `timestamptz`, real foreign keys. `memberships` has no `id` (the pair is the key) and `events` has a `bigint` identity id and no `updated_at`.

Rules the database enforces, whichever client writes (each has a test):
- **Same space:** an item's parent and column must belong to the item's space. Composite foreign keys `(space_id, parent_id)` and `(space_id, column_id, state)` do this.
- **Column and state move together:** the second key above includes `state`, so an item cannot sit in a column of another state. Changing state means changing the column in the same update.
- **Subtrees:** deleting an item deletes its children (`ON DELETE CASCADE`). The service will refuse that without a `mode` (task 4).
- **Columns in use** cannot be deleted (`RESTRICT`).
- **Events are append-only:** a trigger (migration `0001`) rejects every UPDATE and DELETE. Events keep foreign keys to actors and spaces with no cascade, so a space or actor with events cannot be deleted.
- **Allowed values** (`type`, `kind`, `state`) are text columns with CHECK constraints, not Postgres enums, so adding a value is an ordinary migration.
- **Order keys** (`items.position`, `columns.position`) are fractional text keys. The columns are declared `COLLATE "C"` because the database default (`en_US.utf8`) sorts `Zz` after `a0`, and fractional keys need byte order.

Client code: `layers/core/server/db/` holds the connection pool (`getDb`), `withTransaction`, the migration runner (`runMigrations`, which takes an advisory lock so two processes migrate in turn) and `pgError`, which reads the Postgres code and constraint behind a Drizzle error. Postgres reports both a bad reference and a `RESTRICT` refusal as `23503`; the constraint name tells them apart.

Adding a migration after changing a schema file: `docker compose exec run-102 pnpm exec drizzle-kit generate --name <what>`.

## Seeding
`make seed RUN=102` runs `server/seed.ts` in the container. It applies every migration, then loads the demo data in one transaction.
- **Demo data** (`server/seed/fixtures.ts`): 4 actors (Ada, Ben, Cleo and the agent Lurch), 5 spaces (three personal, "Dinner party" and "Studio"), 4 columns per space, and 19 items. The Dinner party has a project, stories and tasks three levels deep, with items in every state.
- **Repeatable:** every row has a readable slug that maps to the same uuid each time (`fixtureId`). Every insert is `ON CONFLICT DO NOTHING`, and an event is written only for a row that this run really inserted. A second run adds nothing, not even events.
- **Safe to run at the same time:** migrations are guarded by an advisory lock, and a conflicting insert waits for the other transaction to finish.
- **Failures are one readable line:** a wrong password prints `failed (28P01)` and an unreachable host prints `failed (ENOTFOUND)`.

## Validation & Error Handling
- Input is validated by the contract's Zod schemas. All problems are reported together as a 400, with a field path such as `query.limit`.
- One error shape for every failure: `{ "error": { "code", "message", "fields" } }`. Codes: `invalid_input` 400, `unauthenticated` 401, `forbidden` 403, `not_found` 404, `method_not_allowed` 405, `conflict` 409.
- Anything unexpected becomes a plain 500 with a generic message. The detail goes to the server log only.
- A response that does not match its contract is a server bug and becomes a 500, never a wrong body.

## Code map (`layers/core/server/`)
- `lib/errors.ts`: error class, shared body schema, `toErrorResponse`.
- `lib/contract.ts`: `defineContract`, `validateInput`, `CONTRACT_VERSION`.
- `lib/registry.ts`: `registerModule`, `listModules`, `matchRoute`.
- `lib/openapi.ts`: `buildOpenApi`.
- `lib/define-route.ts`: the Nitro glue.
- `lib/actor.ts`, `lib/policy.ts`: the actor hook, `can()` and `authorize()`.
- `lib/pagination.ts`, `db/keyset.ts`: the list envelope, cursors and the SQL for "rows after this one".
- `contracts.ts`, `plugins/core.module.ts`, `middleware/api-v1.ts`, `api/v1/*`.

## Layer code (`layers/items/server/`)
- `services/write.ts`: create, update, move, delete.
- `services/read.ts`: list and get.
- `lib/placement.ts`: pure order-key helpers, including the repair of tied keys.
- `schemas.ts`, `contracts.ts`, `api/v1/items*`: the request and response schemas, the contracts, and the routes.

## Layer code (`layers/events/server/`)
- `services/record.ts`: `recordEvent` and the change helpers other layers call. `services/read.ts`: the log read.
- `schemas.ts`, `contracts.ts`, `api/v1/spaces/[id]/events.get.ts`: the schema, the contract and the route.

## Layer code (`layers/tags/server/`)
The proof that a feature is a folder: `db/schema.ts`, `services/tags.ts`, `schemas.ts`, `contracts.ts`, `plugins/tags.module.ts` and `api/v1/...`. Writes take the space lock and record their event in the same transaction; items are read through the items service.

## Tests
`pnpm test` runs Vitest inside the container; the dev server does not need to be running.
- **Unit tests** need no server and no database (`layers/core/tests/lib.test.ts`, `layers/items/tests/placement.test.ts`).
- **Service tests** run on a throwaway database each, with real concurrent connections for the races (`layers/*/tests/*.test.ts`).
- **HTTP tests** (`tests/*-api.test.ts`) call an API-only Nitro server that `tests/global-setup.ts` builds from `tests/server-app` (about 20 seconds, skipped when no source changed) and starts on port 3902, against a fresh seeded database `proto_run_102_http` that is dropped afterwards. Tests that write never touch `proto_run_102`.
- **Contract test** (`tests/contract.test.ts`): reads the OpenAPI document, calls every route for each status it promises, checks each body against the document's schema, and fails if a (route, status) pair was never produced.
- **Removal test** (`tests/removal.test.ts`): builds the API with fewer layers (`LAYERS` and `OUT_DIR` in `tests/server-app/nitro.config.ts`) and checks the rest still works.
- **Freeze test** (`tests/freeze.test.ts`): the live document must still honour `contract/v1.openapi.json`. After a deliberate addition, run `pnpm contract:freeze` against the running server to save the new snapshot.
- **Outside-Nuxt client:** `pnpm contract:smoke` (`scripts/openapi-smoke.mjs`) reads only the OpenAPI document and checks every GET route.
- `pnpm typecheck` checks the server code with TypeScript.
