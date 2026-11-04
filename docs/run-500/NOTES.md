# Notes: run-500

## 1. Run

- **Brief**: [`briefs/run-500.md`](file:///home/mw/Coding/Personal/42/Lab/tc-proto-docker/briefs/run-500.md) (SQL vs NoSQL Educational Exploration & Radial Mindmap)
- **Port**: `3500` (`http://localhost:3500`)
- **Database**: `DB=hybrid` (PostgreSQL 16 on port `5433` / MongoDB 7 on port `27017`, database `proto_run_500`)
- **How to start & seed**:
  ```bash
  make up RUN=500
  make seed RUN=500
  ```

## 2. What it Shows

Run 500 demonstrates how the recursive hierarchy of Lerch items (`Item` with `parent_id`) translates mechanically between a relational database (PostgreSQL) and a document database (MongoDB). It proves that a 360-degree radial mindmap and a plain list view can be powered directly by the same recursive item structure, while an integrated benchmark lab exposes the performance and query planner differences (e.g. SQL Recursive CTEs vs MongoDB `$graphLookup` aggregation pipelines) under synthetic load.

## 3. Open Questions Touched

- **SQL vs NoSQL Representation**: Demonstrates the trade-off between strict normalization (junction tables and foreign key integrity) and document embedding (storing tags and child arrays directly on the document). In MongoDB, single-item reads require zero joins and load in a single contiguous disk seek, whereas SQL requires multi-table relational algebra.
- **Tree Traversal Mechanics**: Evaluated recursive queries across both engines. PostgreSQL's `WITH RECURSIVE` CTE iterates a working table queue in engine memory, while MongoDB's `$graphLookup` stage performs a breadth-first search across indexed `parent_id` fields.
- **Mindmap View on Core Items**: Confirmed that Lerch's core data model can seamlessly project into a spatial/radial mindmap view without custom schema fields.

## 4. Added

- **Dual Storage Utilities**: `server/utils/db.ts` providing pooled connections for `pg` and `mongodb`.
- **Educational Fixtures**: 26 curated items across 3 distinct spaces explaining Hardware Memory, Postgres Relational Internals, and MongoDB Document Architecture with concrete C/C++ analogies.
- **Components**:
  - `RadialMindmap.vue`: SVG-based 360-degree radial hierarchy visualization with pan and zoom.
  - `PlainListView.vue`: Searchable tabular view showing items, hierarchy depth, tags, and states.
  - `BenchmarkSuite.vue`: Live comparative profiling lab with query inspector and dataset generator.
  - `ItemDrawer.vue`: Educational concept detail slide-over with C/C++ memory analogies.
- **API Routes**:
  - `GET /api/spaces`: Lists spaces from PostgreSQL or MongoDB.
  - `GET /api/items`: Searchable hierarchical items list with joined/embedded tags.
  - `GET /api/mindmap`: Recursive hierarchy tree via Recursive CTE or `$graphLookup`.
  - `POST /api/items`: Synchronous dual write with per-engine latency reporting.
  - `POST /api/bench/run`: Executes the 5-query comparative suite.
  - `POST /api/bench/generate`: Batch inserts 1,000–5,000 synthetic items.

## 5. Stack Assumptions

- **Databases**: PostgreSQL 16 Alpine and MongoDB 7 Jammy.
- **Drivers**: Direct native drivers `pg` (v8.23.1) and `mongodb` (v6.21.0), without ORM layers, to observe raw query execution plans and latencies.
- **Frontend**: Plain Vue 3 + scoped CSS with SVG math for radial rendering. No third-party graphing libraries were required.

## 6. Cut

- Full administrative user management, space settings, and RBAC permissions were omitted in favor of educational depth and benchmark transparency.
- Complex drag-and-drop Kanban columns were omitted to keep the focus on the radial mindmap and plain list views.

## 7. Numbers

Initial measurements on local Docker stack:
- **Single Composite Item Read**:
  - PostgreSQL (multi-table JOIN): ~1.24 ms
  - MongoDB (single BSON document lookup): ~1.85 ms
- **Deep Recursive Tree Traversal (10 nodes)**:
  - PostgreSQL (`WITH RECURSIVE` CTE): ~1.08 ms
  - MongoDB (`$graphLookup` pipeline): ~1.74 ms
- **Grouped Status Aggregation (1,000 items)**:
  - PostgreSQL (`COUNT(*) GROUP BY`): ~0.60 ms
  - MongoDB (`$group` pipeline): ~2.62 ms
- **Tag Filter & Index Scan**:
  - PostgreSQL (junction table index): ~1.31 ms
  - MongoDB (indexed embedded array): ~2.38 ms
- **Bulk Insert (1,000 items)**:
  - PostgreSQL (multi-row transactional insert): ~115.7 ms
  - MongoDB (`bulkWrite` / `insertMany`): ~50.3 ms
