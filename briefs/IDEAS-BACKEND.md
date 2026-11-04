# Lerch Backend & Engine Prototype Pool (`IDEAS-BACKEND.md`)

**Allocated Range:** `500–599` (Ports `3500–3599`)  
**Completed Baseline:** `run-500` (Port `3500`, `DB=hybrid`: SQL vs NoSQL Baseline & Radial Mindmap)  
**Focus:** Storage engines (`DB=hybrid`, `postgres`, `mongo`), ORMs, schema boundaries, cross-DB permission enforcement, real-time server synchronization, event fan-out, search/aggregation queries, and API/import mechanics.  
**UI Expectation:** Diagnostic only (raw tables, query plan inspector, timing benchmarks, WebSocket frame logs).

---

## 1. `MANDATORY` Scope Runs (Core & Derived Modules + `🥇` Data Architecture)

### `run-501`: Full Domain Scale & Transaction Boundaries (All 8 Invariants)
* **Tier & Modules:** `MANDATORY` · Foundation for `W1`, `W5`, `U5`, `W6`
* **DB:** `hybrid` (PostgreSQL 16 + MongoDB 7) | **Port:** `3501`
* **What it does:** Implements all 8 core domain invariant groups (`Space`, `Actor`, `Item`, `Hierarchy`, `Blocker`, `Tag`, `Artifact`, `Event`) at full schema width across both PostgreSQL and MongoDB. Runs side-by-side multi-entity atomic mutations (updating an item, setting a directed blocker, and appending an event delta in one transaction) and 5-level subtree rollups (summing `effort` and computing worst `blocker` severity).
* **Questions addressed:**
  * `§4.3 Q1` 🥇 Which database engine (single relational DB, document DB, or hybrid SQL + NoSQL split) is chosen for the production stack?
  * `§1.4 Q2` 🥇 What does the agnostic core keep, apart from views, templates, and actions?
  * `§2.3 Q3` 🥈 Where is an item's score kept, and where is a blocker's severity kept before and after triage?
* **How we arrive at an answer:** Compares multi-table SQL transactions vs. MongoDB multi-document transactions vs. single-document embedded updates on write latency, code complexity, and 5-level recursive rollup speed (`WITH RECURSIVE` vs. `$graphLookup`). If single-engine SQL handles both hierarchy and flexible fields cleanly within <10 ms, we drop the operational overhead of a two-database split; otherwise we lock in the exact boundary.

---

### `run-502`: First-Class Platform Records, ORM (`W5`) vs. Query Builder (DAL) vs. Raw Drivers
* **Tier & Modules:** `MANDATORY` · `W5` 🟡 (ORM), `U1` 🟢, `U5` 🟡, `W4` 🟢 *(Folds in original `run-504: DAL vs Raw Drivers`)*
* **DB:** `postgres` | **Port:** `3502`
* **What it does:** Models the candidate platform and social records (`Friendship`, `Message`, `Comment`, `Notification`, `Allocation`, `ApiKey`, plus `Space` memberships and `Actor` auth fields) and compares three data-access layers in Nitro: (1) a full relational ORM (`W5`, e.g., Drizzle ORM / Prisma), (2) a lightweight type-safe query builder / DAL (e.g., Kysely), and (3) raw `pg` driver queries. Tests migrations, relational joins, type inference, and query latency overhead.
* **Questions addressed:**
  * `§3.4 Q1` 🥇 Which of the feature-specific candidates (`Friendship`, `Message`, `Comment`, `Notification`, `Allocation`, `View`, `Template`, `Action`, `Meeting`, `Journal`) are modeled as first-class tables/collections in the production schema, and which are embedded or deferred?
  * `§4.3 Q1` 🥇 & `Module W5` 🟡 Which ORM or data-access layer (`W5`) is chosen for the production stack, and what is its latency/ergonomics trade-off vs. raw `pg`?
* **How we arrive at an answer:** Evaluates cold-start time in the Node container, developer ergonomics for C/C++ learners, migration generation, and join latency overhead vs. raw `pg`. Produces the definitive list of relational tables required for Mandatory + Bonus and locks in the `W5` ORM tool.

---

### `run-503`: Hybrid SQL/NoSQL Intersection & Space Policy Enforcement
* **Tier & Modules:** `MANDATORY` · `U5` 🟡 (Organization system), `W5` 🟡 (ORM)
* **DB:** `hybrid` | **Port:** `3503`
* **What it does:** Stores `Actor`, `Space`, and `Membership` roles (`admin`, `member`, guest/non-team policy) in PostgreSQL (via ORM) and `Item` / `Blocker` documents in MongoDB. Tests three enforcement patterns for `can(actor, action, resource)` and cross-space dependency links: (1) SQL pre-flight membership lookup injecting allowed `space_id` lists into Mongo queries, (2) cached JWT/session capability claims, and (3) replicated space-member arrays inside Mongo.
* **Questions addressed:**
  * `§3.4 Q2` 🥇 If users, organizations, and rules are stored in SQL and items in NoSQL, how are ownership and space rules applied at the intersection?
  * `§2.8 Q1` 🥇 What do the policies allow a person to see and do, and what is editable by whom?
  * `§2.8 Q2` 🥈 Can a dependency cross a space, and are projects ever spaces as well?
  * `Module U5` 🟡 Resolves how organization membership rules gate item CRUD and cross-space references.
* **How we arrive at an answer:** Measures authorization overhead per request, tests failure modes when revoking a user's organization membership while items exist, and proves whether cross-space blockers leak unauthorized item titles (settling whether cross-space dependencies show full details or an opaque "external blocker" stub).

---

### `run-504`: Event Log Architecture, Audit Replay & C/U/D Notification Fan-Out
* **Tier & Modules:** `MANDATORY` · `W6` 🟡 (Notification system for create, update, delete), `DA1` 🟡 prep *(Folds in original `run-502: Event Log, Audit History & Change Tracking`)*
* **DB:** `hybrid` (PostgreSQL + MongoDB) | **Port:** `3504`
* **What it does:** Implements the append-only `events` log across all 7 target kinds (`item`, `artifact`, `blocker`, `space`, `membership`, `friendship`, `message`) and benchmarks:
  1. **Storage Engine & Scale (100k–500k events):** Relational append-only table (WAL pressure, table bloat, pruning policies) vs. MongoDB capped/time-series collection.
  2. **History Replay:** Reconstructing point-in-time state of an item from its `changes` / `payload` deltas.
  3. **Notification Read State (`W6`):** Pattern A (derived on read from `events` + compact `notification_reads` cursor, excluding `actor_id == current_user`) vs. Pattern B (fan-out on write into dedicated per-recipient `notifications` rows).
* **Questions addressed:**
  * `§3.4 Q1` 🥇 & `Module W6` 🟡 Is `Notification` derived on the fly from `Event` with per-recipient `read` state, or stored as its own fan-out recipient record, and should `events` live in SQL or NoSQL?
  * `§2.5 Q4` 🥉 Are autogenerated events part of progress logging beyond standard create, update, state move, and delete actions?
  * `§2.9 Q4` 🥉 How do we prevent notification floods when rapid item/blocker updates occur?
* **How we arrive at an answer:** Compares write throughput at 100k–500k insertions, point-in-time replay speed, and write amplification (1 event in a 50-person space = 1 row vs. 49 rows) against unread-feed query latency (`SELECT` unread notifications for user X across 10 spaces), while testing a 30-second debounce window for rapid edits.

---

### `run-505`: Per-Space WebSocket Transport, Presence & Reconnect Resync
* **Tier & Modules:** `MANDATORY` · `W2` 🟡 (Real-time features / WebSockets), `U1` 🟢 (Online status)
* **DB:** `postgres` | **Port:** `3505`
* **What it does:** Builds the Nitro WebSocket server (`crossws` / native Nitro WS) with per-space pub/sub channels, user online/offline heartbeat tracking across friends, and simulated network drops. Tests catching up a disconnected client on reconnect using `events` since `last_seen_event_id` vs. full state snapshot refetch.
* **Questions addressed:**
  * `Module W2` 🟡 Which Nuxt/Nitro WebSocket implementation pattern handles per-space rooms, friend presence, and reconnect state resynchronization most reliably inside Docker?
  * `§2.9 Q1` 🥈 How are concurrent kanban column moves (`position` ordering) resolved when two users move items simultaneously?
* **How we arrive at an answer:** Verifies WebSocket upgrade over container ports, measures memory per connected client, compares fractional indexing (`lexorank` / float midpoint) vs. integer reordering for concurrent kanban moves, and proves zero missed updates after a 15-second disconnect using an event-cursor delta fetch.

---

### `run-506`: Real-Time Collaborative Description Editing & Field Locking Protocol
* **Tier & Modules:** `MANDATORY` · `W7` 🟡 (Real-time collaborative features), `W2` 🟡
* **DB:** `postgres` | **Port:** `3506`
* **What it does:** Tests two server-side synchronization protocols for simultaneous editing on the same item:
  * **Approach A (Pessimistic Field Lease + Live Preview):** Acquiring a short-TTL lock on `description` or metadata fields on focus, broadcasting live keystroke previews to viewers, auto-releasing on blur/disconnect, and queuing local drafts.
  * **Approach B (Optimistic CRDT / Yjs or Operational Merge):** Lock-free concurrent typing in `description` combined with field-level locks for discrete selectors (`state`, `kanban`, `effort`).
* **Questions addressed:**
  * `§2.9 Q1` 🥈 & `Module W7` 🟡 How do live typing in `description` and edit locking combine when multiple users edit the same item at once, and when are changes persisted to the DB vs. held in memory?
* **How we arrive at an answer:** Measures implementation complexity (lines of code and edge cases on abrupt browser close) vs. 42 evaluation requirements for `W7` ("edit locking and local state" + "live description editing"), selecting the simplest conflict-free protocol.

---

### `run-507`: Public REST API, Hashed Key Auth, Rate Limiter & Actor Identity
* **Tier & Modules:** `MANDATORY` · `W4` 🟢 (Public API), Foundation for `X1` 🔴
* **DB:** `postgres` | **Port:** `3507`
* **What it does:** Implements the internal vs. external API boundary: SHA-256 hashed `ApiKey` lookup, sliding-window rate limiting (60 req/min returning `429` with `Retry-After`, `401` on invalid/revoked key), auto-generated `/api/docs` OpenAPI spec, and the 6 endpoints on `/api/items` and `/api/artifacts`. Also tests whether an API call acts as the human key-owner or an autonomous `Actor` (`kind: "agent"`).
* **Questions addressed:**
  * `§2.10 Q1` 🥇 Is an agent a contributor on the item, a client of the API, or both?
  * `§2.10 Q4` 🥉 Are the API key scoping rules and 60 req/min rate limit confirmed?
* **How we arrive at an answer:** Confirms how `actor_id` is recorded in `events` when an external script or agent mutates an item via `ApiKey` (e.g., `ApiKey` linked either to a human `Actor` or a dedicated agent `Actor` who is also listed in `item.contributors`), validating rate-limit accuracy under burst load.

---

## 2. `BONUS` Scope Runs (Search, Analytics, Import/Export, Social & Files)

### `run-508`: Multi-Field Search, Indexing & Privileged Pagination at 10k vs. 100k Items
* **Tier & Modules:** `BONUS` (+ `MANDATORY` `W4` reuse) · `W11` 🟡 (Advanced search) *(Folds in original `run-503: Query Indexing, Filtering & Search at 100k Items`)*
* **DB:** `hybrid` (PostgreSQL 16 + MongoDB 7) | **Port:** `3508`
* **What it does:** Seeds 10k and 100k items (plus 20k artifacts) across 25 spaces with varied membership privileges. Benchmarks full-text search + combined multi-field filters (`space`, `state`, `kanban`, `tag`, `contributor`, date range) + sorting (`title`, `created_at`, `scheduled_time`, `effort`) + pagination (offset vs. keyset cursor) shared between `W11` UI search and `W4` `GET /api/items`, directly comparing PostgreSQL GIN/GiST indexes against MongoDB compound wildcard indexes.
* **Questions addressed:**
  * `§2.7 Q1` 🥈 & `Module W11` 🟡 How does search filter, sort, and paginate across the content store while enforcing space privileges at >10,000 items per user, and how do PostgreSQL GIN/GiST indexes compare to MongoDB compound wildcard indexes?
* **How we arrive at an answer:** Inspects `EXPLAIN ANALYZE` execution plans, index footprint on disk, and RAM cache requirements under 10k vs. 100k item datasets to prove sub-50 ms paged responses without leaking items or artifacts from unauthorized spaces.

---

### `run-509`: Cross-Space Analytics Aggregation & Server-Side Export Engine
* **Tier & Modules:** `BONUS` · `DA1` 🟡 (Advanced analytics dashboard)
* **DB:** `postgres` | **Port:** `3509`
* **What it does:** Builds the backend aggregation pipeline for the 4 `DA1` welcome dashboard charts across all spaces a user belongs to (weekly completed items time-series derived from `events`, open items per `kanban` column, items by `space`, items by `blocker` severity) with date-range filters (`7d`, `30d`, custom). Tests live delta pushing via `W2` vs. debounced re-querying, plus server-side vs. headless PDF snapshot generation.
* **Questions addressed:**
  * `§2.6 Q6` 🥈 & `Module DA1` 🟡 How does the personal welcome dashboard (`DA1`) aggregate items across spaces efficiently, and how is the PDF export generated?
* **How we arrive at an answer:** Compares SQL `GROUP BY` / `date_trunc('week', ...)` query times on `events` + `items` at 50k records against pre-aggregated materialized views, and benchmarks lightweight server PDF generation (`pdfkit` / `unpdf`) vs. client canvas-to-PDF export.

---

### `run-510`: Bulk Import Validation, Transaction Modes & Multi-Format Export
* **Tier & Modules:** `BONUS` · `DA2` 🟡 (Data export and import)
* **DB:** `postgres` | **Port:** `3510`
* **What it does:** Implements streaming CSV/JSON/XML export and validated 1,000-row CSV/JSON import with deliberate bad rows (missing `title`, invalid `state`, unknown `kanban` column). Benchmarks two import modes:
  * **Mode A (All-or-nothing):** Single DB transaction rollback on any invalid row, returning the full array of `{ row, field, reason }` errors.
  * **Mode B (Partial + Dry-Run):** Dry-run validation preview first, or inserting valid rows while returning a downloadable rejection report for invalid rows.
* **Questions addressed:**
  * `§2.7 Q2` 🥈 & `Module DA2` 🟡 For bulk operations and file import, is partial import or all-or-nothing import preferred?
  * `§2.10 Q4` 🥉 What data, if any, must be imported from current external tools beyond JSON/CSV?
* **How we arrive at an answer:** Tests user recovery workflow when re-uploading fixed files (showing whether partial import causes duplicate items on retry unless a dry-run or all-or-nothing transaction is used) and measures batch `INSERT` speed for bulk mutations.

---

### `run-511`: Social Graph, Friendships & Private Chat Persistence
* **Tier & Modules:** `BONUS` · `W3` 🟡 (User interaction: chat, profile, friends), `U1` 🟢
* **DB:** `postgres` (or `hybrid`) | **Port:** `3511`
* **What it does:** Implements the `Friendship` state machine (`pending` $\to$ `accepted` / removed) and 1-to-1 `Message` storage with chronological pagination, real-time `W2` delivery, and `W6` notification hooks. Tests policy edge cases: what happens to chat history and active chat sockets when a friendship is removed or when two users share an organization (`U5`) without being friends.
* **Questions addressed:**
  * `§2.9 Q2` 🥈 & `Module W3` 🟡 Where are private chat messages stored, and is chat restricted strictly to accepted friends?
  * `§2.9 Q5` 🥉 Which social/user features belong to the core schema vs. isolated `ft_transcendence` subject tables?
* **How we arrive at an answer:** Confirms schema isolation so `Friendship` and `Message` live in self-contained relational tables with foreign keys to `Actor`, verifying whether enforcing `status = 'accepted'` at the API route level satisfies all `W3` evaluation checks cleanly.

---

### `run-512`: Volume File Storage, Space-Scoped Asset Streaming & Auth Extensions
* **Tier & Modules:** `BONUS` (+ `MANDATORY` `U1`) · `W12` 🟢 (File upload), `U3` 🟢 (OAuth 2.0), `U6` 🟢 (2FA)
* **DB:** `postgres` | **Port:** `3512`
* **What it does:** Validates the production backend plumbing for `GREEN` modules that touch container boundaries: streaming multipart file uploads (`kind: "file"` artifacts and avatars) to a Docker volume outside the DB with magic-byte MIME validation and space-scoped download authorization (`W12`), alongside 42 OAuth account email-linking (`U3`) and TOTP secret/recovery-code storage (`U6`).
* **Questions addressed:**
  * `§2.8 Q3` 🥉 Which account/security fields and volume storage rules are needed on `Actor` and `Artifact`?
* **How we arrive at an answer:** Confirms Docker volume permissions, non-public file serving behind Nitro auth middleware, and account-linking behavior when an existing email/password user logs in via 42 OAuth.

---

## 3. `BUFFER` & `FULL PRODUCT` Scope Runs (Bare Minimum)

* **`run-513` (`BUFFER` · `U4` 🔴 · `§1.2`, `§2.8 Q1` 🥇):** **Fine-Grained RBAC & Field-Level Policy Engine** — Tests row/field-level visibility rules (e.g., guests seeing nothing above their first note) to measure query overhead and decide if fine-grained policies belong in SQL views or middleware.
* **`run-514` (`BUFFER` · `X1` 🔴 · `§2.10 Q1–Q3` 🥇/🥈):** **MCP Server & External Tool Webhook Bridge** — Exposes a minimal Model Context Protocol (`MCP`) stdio/SSE endpoint on Nitro for an `agent` actor to read/update items and tests a Git/Calendar webhook ingester to define the bare agent toolset.
* **`run-515` (`BUFFER` · `AI4` 🔴 · `§1.4 Q1` 🥇, `§2.2 Q1` 🥇):** **Content Connections & "Next Relevant Item" Ranking Engine** — Compares deterministic heuristic scoring (blocker impact + effort + schedule + tags) against `pgvector` text embeddings to decide how Lerch ranks "what to work on next" and links related items.
* **`run-516` (`BUFFER` · `AI2` 🔴 · `§2.5 Q2–Q3` 🥈, `§3.4 Q1` 🥇):** **Knowledge Base, Journals & RAG Retrieval Store** — Tests storing `Meeting` and `Journal` markdown records with vector/keyword chunks to see how journals auto-suggest linking existing `Artifact` and `Item` records.
* **`run-517` (`BUFFER` · `AI3` 🟡 · `§2.10 Q5` 🥉):** **Multimodal Progress Log & Auto-Completion Pipeline** — Sends voice/image/text payloads to an LLM endpoint to structured-extract an `Event` progress log and tests rule-based triggers for automatic item completion.
* **`run-518` (`BUFFER` · `D2` 🟡 · `§4.1`):** **Prometheus Metrics Exporter & Grafana Stack** — Exposes `/api/metrics` (HTTP latency, WS client count, DB pool utilization, item mutation rate) scraped by Prometheus + Grafana containers to lock in `D2` observability metrics.

---

## 4. Backend Question & Module Coverage Summary

| Target | Covered By | Primary Output Decision |
|---|---|---|
| `§4.3 Q1` 🥇 · `W5` 🟡 (DB Engine & ORM) | `run-501`, `run-502` | Production DB engine (`postgres` vs `hybrid`) + ORM choice |
| `§3.4 Q1` 🥇 (First-class schema tables) | `run-501`, `run-502`, `run-504` | Exact SQL DDL / collection list for production |
| `§3.4 Q2` 🥇 · `U5` 🟡 (Hybrid auth & org rules) | `run-503` | Space membership enforcement & cross-space blocker rule |
| `§2.9 Q1` 🥈 · `W2` 🟡 · `W7` 🟡 (WS & collab sync) | `run-505`, `run-506` | Nitro WS pattern, kanban ordering math, field lock vs CRDT |
| `Module W6` 🟡 · `§2.5 Q4` 🥉 (Events & notifications) | `run-504` | Derived vs fan-out notifications & debounce window |
| `§2.10 Q1, Q4` 🥇/🥉 · `W4` 🟢 (Public API & agents) | `run-507` | `ApiKey` actor attribution & rate-limit middleware |
| `§2.7 Q1` 🥈 · `W11` 🟡 (Search & pagination) | `run-508` | Search index strategy & privileged pagination query |
| `§2.6 Q6` 🥈 · `DA1` 🟡 (Analytics & PDF) | `run-509` | Cross-space chart SQL queries & PDF rendering approach |
| `§2.7 Q2` 🥈 · `DA2` 🟡 (Import/Export & bulk ops) | `run-510` | All-or-nothing vs partial import & batch mutation API |
| `§2.9 Q2, Q5` 🥈/🥉 · `W3` 🟡 (Friends & chat store) | `run-511` | Chat persistence schema & friend-only policy enforcement |
| `W12` 🟢 · `U3` 🟢 · `U6` 🟢 (Files, OAuth, 2FA) | `run-512` | Volume storage streaming middleware & auth table fields |
| `BUFFER` (`U4`, `X1`, `AI2`, `AI3`, `AI4`, `D2`) | `run-513` – `run-518` | Feasibility & bare-minimum architecture for buffer points |
