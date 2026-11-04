# Backend Architecture: run-500

## Database Integration & Dual Engine Architecture

Run 500 operates in hybrid storage mode (`DB=hybrid`), maintaining synchronized state between PostgreSQL 16 (relational) and MongoDB 7 (document).

### 1. Connection Layer (`server/utils/db.ts`)
- **Execution Boundary**: Server-only Nitro utility. Runs strictly inside the Node container. Auto-imported by all server event handlers.
- **PostgreSQL Pool**: Single shared `pg.Pool` instance configured with connection pooling (`max: 10`, `idleTimeoutMillis: 30000`) connecting to `proto_run_500`.
- **MongoDB Client**: Single shared `MongoClient` instance connecting to `proto_run_500` with connection pooling.
- **Timing Helper**: `queryPg(sql, params)` measures and returns server-side query execution latency in milliseconds (`durationMs`).

### 2. Physical Schemas & Representation Comparison

| Concept | PostgreSQL (Relational) | MongoDB (Document) | Mechanical Difference |
|---|---|---|---|
| **Spaces** | `spaces` table (`id`, `name`, `type`, `description`, `created_at`) | `spaces` collection with matching BSON document structure | Direct 1:1 mapping |
| **Actors** | `actors` table (`id`, `name`, `kind`, `created_at`) | `actors` collection with matching BSON document structure | Direct 1:1 mapping |
| **Items** | `items` table (`id`, `space_id`, `title`, `description`, `parent_id`, `state`, `position`, `depth`, `created_at`, `updated_at`) | `items` collection (`_id`, `space_id`, `title`, `description`, `parent_id`, `state`, `position`, `depth`, `tags: string[]`, `created_at`, `updated_at`) | Hierarchy is stored via self-referencing `parent_id` in both engines. |
| **Tags & Associations** | `tags` table + `item_tags` junction table (foreign keys to `items` and `tags`) | Embedded array `tags: string[]` directly inside the item document | In SQL, tags require multi-table `JOIN`s or subqueries. In MongoDB, tags are retrieved in the same single-disk-read as the item with zero joins. |

### 3. Programmatic Seeding Contract (`server/seed.ts`)
- Executed via `make seed RUN=500` (`pnpm db:seed` inside container).
- **Strict Idempotency**:
  - PostgreSQL: DDL uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. DML uses `ON CONFLICT (id) DO UPDATE` or `ON CONFLICT DO NOTHING`.
  - MongoDB: Uses `updateOne(..., { upsert: true })` and `createIndex(...)`.
- **Curated Educational Fixtures**:
  - `space-db-fundamentals`: Memory hierarchy, page buffers, B+ Trees vs LSM Trees, ACID vs BASE.
  - `space-sql-mechanics`: Heap pages, slotted tuples, MVCC, normalization, join algorithms (nested loop, hash join), and recursive CTEs.
  - `space-nosql-mechanics`: BSON layout, WiredTiger compression, embedding vs referencing, single-document atomicity, and `$graphLookup`.

## Server Endpoints (`server/api/`)

Nitro server routes execute in the Node container with direct DB access:

### `GET /api/spaces`
- **Query Params**: `source?: 'postgres' | 'mongo'`
- **Payload**: `{ source, durationMs, spaces: [{ id, name, type, description }] }`
- **Postgres Mechanics**: `SELECT id, name, type, description FROM spaces ORDER BY id ASC`
- **Mongo Mechanics**: `db.collection('spaces').find({}).toArray()`

### `GET /api/items`
- **Query Params**:
  - `space_id?: string`
  - `parent_id?: string` (supports `'null'` or `'root'`)
  - `search?: string` (case-insensitive substring filter)
  - `source?: 'postgres' | 'mongo'`
  - `limit?: number` (max 5000)
- **Postgres Mechanics**: Executes SQL query with `LEFT JOIN item_tags` and `ARRAY_AGG(tags.name)`, along with a subquery counting direct children.
- **Mongo Mechanics**: Aggregation pipeline matching filters, sorting by hierarchy, and using `$lookup` on `parent_id` to compute child counts.

### `GET /api/mindmap`
- **Query Params**:
  - `root_id?: string`
  - `space_id?: string`
  - `source?: 'postgres' | 'mongo'`
- **Postgres Mechanics**: Executes a recursive Common Table Expression (`WITH RECURSIVE item_tree AS (...)`) to fetch the entire subtree in a single database roundtrip, joining tags on the resulting set.
- **Mongo Mechanics**: Executes an aggregation pipeline with `$graphLookup` (`connectFromField: '_id', connectToField: 'parent_id'`) accumulating all descendants in a single document lookup.
- **Response**: `{ source, durationMs, nodeCount, rawQuery, root: { id, title, children: [...] } }`

### `POST /api/items`
- **Body**: `{ space_id, parent_id?, title, description?, state?, tags?: string[] }`
- **Mechanics**: Performs atomic transactional insert in PostgreSQL (`items` + `item_tags`) and inserts the document into MongoDB with embedded `tags`. Returns latency metrics for both writes (`timings: { postgresMs, mongoMs }`).
