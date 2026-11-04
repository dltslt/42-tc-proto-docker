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
