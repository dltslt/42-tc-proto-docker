# Backend Architecture: run-101

There are no API routes yet (they start in task 3). This file covers the database, which every later task builds on.

## Where the code lives
Each layer owns its tables. All of this is server-only and is imported explicitly, because Nitro auto-imports only
from `server/utils`, and the seed script and tests run under plain Node without Nuxt.

| File | Holds |
|---|---|
| `layers/core/server/db/client.ts` | Connection URL and pool |
| `layers/core/server/db/columns.ts` | `sortKey`, the fractional order column type |
| `layers/core/server/db/schema.ts` | `events` |
| `layers/workspace/server/db/schema.ts` | `spaces`, `actors`, `memberships`, `columns` |
| `layers/items/server/db/schema.ts` | `items` |
| `layers/*/shared/` | State and type names, plain values that the browser can import too |
| `server/db/migrations/` | The one linear migration history |
| `server/db/migrate.ts`, `server/db/fixtures.ts`, `server/seed.ts` | Applying migrations and seeding |

## Rules the database enforces
These hold even if a route has a bug, so services do not have to check them first. They do not replace the readable
errors that task 5 returns.

| Rule | Mechanism |
|---|---|
| Parent, column and lead belong to the item's space | Composite foreign keys that include `space_id` |
| An item's state always equals its column's state | `items_column_fk` on `(space_id, column_id, state)` |
| A lead is a member of the space | `items_lead_fk` points at `memberships` |
| An item is not its own parent | `items_not_own_parent` check. Longer cycles are stopped in task 5 by the per-space lock |
| Names and titles are not blank | Check constraints |
| Events cannot be changed or removed | `events_append_only` trigger on `UPDATE`, `DELETE` and `TRUNCATE` |
| Sort keys compare by bytes | `COLLATE "C"` on `position`, like `strcmp()` |

Postgres ignores a composite foreign key if any of its columns is null (`MATCH SIMPLE`), so `parent_id` and `lead_id`
stay optional.

## Schema choices
- **Ids** are UUIDs, except `events.id`, an identity column that also records the order of events within one transaction.
- **`events.target_kind`, `target_id` and `type` are free text** with no foreign key, so a new module can log new kinds without a migration, and events outlive what they describe.
- **`events.changes`** is `{ field: { old, new } }`. A created row has `old: null`.
- **Discarded items have a column** (hidden by the board), so `column_id` is never null. Every space therefore needs a column for each of the four states.
- **`description` is `NOT NULL DEFAULT ''`**, so a client never has to handle two kinds of empty.

## Migrations
- After changing a schema file, run `docker compose exec run-101 pnpm db:generate --name=<what_changed>`, then `make seed RUN=101` to apply it.
- `0000_initial_schema.sql` is generated. `0001_event_rules.sql` is hand-written: it holds the trigger, which Drizzle cannot express, and the foreign keys of `events`, which would make `core` import `workspace`.
- Do not use `drizzle-kit push`. It compares against the schema files and would drop what only the hand-written migration knows about.

## Seed
`make seed RUN=101` runs `server/seed.ts`: wait for Postgres (up to 30 seconds, because `make init` seeds right after
starting it), apply migrations, then insert the fixtures in one transaction.

- Ids are derived from fixture names, so a second run recognises its rows, and `ON CONFLICT DO NOTHING` skips them.
- Edits to existing rows survive a reseed. A fixture deleted through the app comes back, with a new event.
- Each inserted item gets an `item.created` event by the agent Lurch. Spaces, actors and columns get none, because no route writes them and they are setup data.

| Space | Type | Members | Items |
|---|---|---|---|
| Lerch Team | organization | Ada, Ben, Lurch | 13, nested down to a subtask, with a custom Review column |
| Dinner Club | organization | Ada, Cleo | 4 |
| Ada personal | personal | Ada | 1 |
| Ben personal | personal | Ben | 1 |

Ada is in three spaces and Cleo in one, so tasks 3 and 4 can show that switching persona changes what is visible.
