# `ft_transcendence`: Lerch Prototypes (Docker)

This repository is `tc-proto-docker`. It holds the Lerch prototypes in an orchestrated Docker environment moving toward product stage.

Lerch is a task and project tool built for a team first. It is a hub for the next relevant piece of work: it stays out of the way, and an ordinary change takes the fewest steps. The core is items, their relations, and a space.

A prototype is also a lesson. The team and readers learned software engineering in the 42 curriculum, primarily in C and C++. They are learning Nuxt, Vue, TypeScript, and modern web architectures. Write the code, comments, and documentation so a developer with a systems background can read a prototype and immediately understand what the framework does and where the code runs.

```text
.
├── AGENTS.md            the rule every prototype agent follows, including how to commit
├── README.md            repository overview, quick start, and curriculum roadmap
├── PROMPT.md            the harness prompt that starts a run; names a run and a brief
├── briefs/              one brief per prototype defining the scenario to evaluate
├── docs/                technical documentation and prototype run documentation
│   ├── README.md        master documentation index and curriculum guide
│   ├── docker/          platform and container architecture deep-dives
│   ├── template/        starter documentation templates for prototype runs
│   └── run-XX/          documentation for prototype run-XX (design.md, NOTES.md, etc.)
├── prototypes/
│   ├── template/        the baseline Nuxt app every prototype starts from; do not build here
│   └── run-XX/          isolated prototype runs (run-01/, run-02/, etc.)
├── docker/              database initialization scripts and container configs
├── scripts/             control plane and scaffolding automation scripts
└── .agents/             agent skills for git commits and modern web guidance
```

---

## Guiding Principles for C/C++ Developers

Web applications introduce layers of implicit behavior ("magic"), distinct execution environments, and reactive data tracking that feel alien compared to single-process C/C++ binaries.

To guide team members through the code without turning prototypes into lectures:

### 1. Execution Boundaries ("Where does this run?")
Unlike a compiled C binary where all code executes in a single local process, a Nuxt application spans multiple environments:
- **Server-only (`server/api/`, Nitro)**: Executes strictly inside the Node container. Has direct access to database engines (Postgres, Mongo) and private environment variables.
- **Client-only (browser)**: Executes strictly in the user's browser (DOM manipulation, browser events, localStorage, `<ClientOnly>` blocks).
- **Universal / SSR (Vue components, `<script setup>`)**: Executes **both** on the server (to pre-render initial HTML) and then in the browser (to "hydrate" interactive state). Never use server-only or browser-only APIs in universal code without checking the environment (`import.meta.server` or `import.meta.client`).
- **Container vs. Host Network**:
  - Inside the Docker bridge network, services communicate using internal container hostnames and default ports (e.g. `postgres:5432`, `mongo:27017`).
  - Developers and browsers on the host access prototypes via mapped ports (`http://localhost:3001` for `run-01`, `3002` for `run-02`).
  - Host database tools connect to PostgreSQL on port `5433` (mapped from container `5432` to avoid host conflicts) and MongoDB on port `27017`.

### 2. De-mystifying the "Magic" (Implicit Mechanics)
- **Auto-imports**: In C, missing an `#include` is a compile error. Nuxt automatically imports Vue primitives (`ref`, `computed`, `watch`), Nuxt composables (`useFetch`, `useRoute`, `useRouter`), and components located in `components/` without explicit `import` statements.
- **File-based routing**: Endpoints and pages are registered purely by filesystem location. For example, `server/api/tasks/[id].get.ts` automatically registers `GET /api/tasks/:id`.
- **Reactivity vs. Imperative Flow**: Vue's `ref()` and `computed()` are reactive proxies tracking dependencies, not raw static memory locations. In `<script setup>`, access the underlying value using `.value`. In `<template>`, Vue unwraps `.value` automatically.

---

## Core Domain Concepts

Lerch concepts remain consistent across prototypes:

- **Items (`tasks`)**: Work units with a hierarchy level: `project`, `epic`, `story`, `task`, or `subtask`. `contributors` is a `;`-separated list of actors. `lead` may be empty.
- **Relations**: Parent-child hierarchy links (`parent_id` mirrors the relation record). An item with no parent has an empty `parent_id`.
- **Spaces**: Organizational or personal boundaries containing items and members.
- **Members & Actors**: People or automated agents in a space with assigned roles.
- **Blockers**: Directed dependencies where one item blocks another (`blocker_item_id` blocks `blocked_item_id`).
  - Severity scale: `cannot do anything`, `will be stuck`, `slowed down`, `nice to have`.
- **Item Scores**: Assessment values: `doesn't work`, `bare minimum`, `satisfactory`, `excellent`.
  > [!IMPORTANT]
  > Blocker severity and item scores are two completely different scales. Never merge them.
- **The Dinner Fixture:** In 10,000-item datasets: project "Dinner" with task "cut the bread", project "Buy cutlery" with task "bread knife", and a blocker from "bread knife" to "cut the bread" with severity `cannot do anything`. Both tasks then have effort and a scheduled time.
- **Timestamps:** Timestamps are offsets from `2026-10-30T00:00:00Z`. A read that wants "today" shifts every timestamp by the gap between that day and the day it reads.

---

## The Database

The prototypes evaluate both relational and document-oriented representations of the core Lerch domain.

### Schema Entities

| Table / Collection | What a record is |
|---|---|
| `actors` | a person or an agent. `spaces` lists the spaces, separated by `;` |
| `spaces` | an organisation space or a personal space |
| `members` | one actor in one space, with a role |
| `columns` | a kanban column in one space. `position` is its order. `state` is the category of that column |
| `tasks` | one item. `level` is project, epic, story, task, or subtask. `contributors` is a `;` list. `lead` may be empty |
| `relations` | one parent and one child. This is the hierarchy record |
| `tags` | one of 40 tags |
| `item_tags` | one tag on one item |
| `blockers` | one blocker link. `blocker_item_id` blocks `blocked_item_id` |
| `artifacts` | a title and a URL. Never a copy of the document |
| `item_artifacts` | one artifact on one item |
| `events` | one event on one item. Each item has 2 to 4 |

> [!NOTE]
> *[Stub / Incomplete: The schema entities listed here represent a preliminary data model created for early exploratory prototypes. Detailed domain specifications and refined entity models will be documented here as they are released.]*

### Shared Container Engines & Connection URLs

Database services run centrally in Docker Compose:
- **PostgreSQL 16 Alpine**: Service `postgres:5432` (host port `5433`).
- **MongoDB 7**: Service `mongo:27017` (host port `27017`).

Individual prototypes inherit global credentials from the root `.env` via `base-proto`. Inside each prototype run, connection URLs are dynamically assembled using `process.env.DB_NAME` (e.g. `proto_run_01`):
- **PostgreSQL**: `postgresql://${DB_USER}:${DB_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${DB_NAME}`
- **MongoDB**: `mongodb://${DB_USER}:${DB_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/${DB_NAME}?authSource=admin`

### The Programmatic Seeding Contract (`pnpm db:seed`)
Every prototype implements `package.json` with `"db:seed": "tsx server/seed.ts"`. Seeding is invoked via:
```bash
make seed RUN=1    # Executes 'pnpm run db:seed' inside container run-01
```
The seed script must be idempotent: creating schemas/collections if missing and inserting baseline fixtures safely.

---

## Stack (Current State)

The team has chosen Nuxt 4 within Docker. The current architectural baseline and working assumptions:

- **Server:** Nuxt server routes (`server/api/`, Nitro) running inside Node containers. No standalone secondary backend framework.
- **Databases:** Containerized PostgreSQL 16 and MongoDB 7 running as shared services in Docker Compose, providing dedicated logical databases per prototype (`DB=hybrid`, `postgres`, `mongo`, or `none`).
- **Package Manager:** `pnpm` (backed by shared Docker named volume `pnpm_store` for instant caching and deduplication).
- **Interface:** Plain Vue components and Tailwind / CSS.
- **Identity:** No full auth system unless requested by a brief. A lightweight "current user" selector in the header switches active personas.
- **Port Architecture:** Single 1:1 port mapping (`$PORT:$PORT` where `$PORT = 3000 + N`). Nuxt listens directly on `$PORT` inside the container, matching host port and Vite HMR client websocket port.
- **Product Stubs:** Isolate configurable business policies into dedicated modules:
  - Permission check `can(actor, action, resource)` (default: allow all).
  - Ordering policy for "what to show next".
  - Default column placement for new items (default: first `unstarted` column).

---

## Prototype Execution & Workflow

### 1. Before You Write Code

Read these, in this order:

1. This file (`AGENTS.md`).
2. The product context and specification.
3. The brief the prompt names under `briefs/`. Where it and this file disagree, the brief wins.

**Prototype Isolation & Working Directory Boundaries:**
- **Code Directory**: Write prototype code **strictly** inside `prototypes/<run-dir>/` (e.g. `prototypes/run-01/`).
- **Documentation Directory**: Write prototype documentation **strictly** inside `docs/<run-dir>/` (e.g. `docs/run-01/`).
- Do not edit `prototypes/template/`, `docs/template/`, `briefs/`, `AGENTS.md`, `README.md`, `PROMPT.md`, or other prototype directories.
- Do not inspect, search, or diff any other prototype directory. Search only inside your designated run and docs directories. An empty "Findings from earlier runs" section in a brief stays empty unless explicitly filled by hand.

### 2. Kinds of Brief

> [!NOTE]
> *[Stub / Incomplete: Brief categories (e.g. fast, proper) and evaluation criteria will be detailed here once the upcoming brief overhaul is finalized.]*

### 3. Step-by-Step Workflow

1. **Deconstruct:** Split the slice into small, digestible chunks that a reviewer can read as a single concept.
2. **Authorship:** Create the `<harness>-<model>` file at the prototype code root (`prototypes/<run-dir>/<harness>-<model>`).
3. **Incremental Implementation:** Build chunk by chunk. Add 1-line orientation comments for framework mechanisms. Commit each chunk using the scoped git workflow.
4. **Documentation:** Maintain `docs/<run-dir>/design.md`, `docs/<run-dir>/frontend.md`, and `docs/<run-dir>/backend.md`. Update them as design evolves.
5. **Browser Verification:** Verify every criteria under "Done when" in the brief directly in the browser.
6. **Wrap-up:** Write `docs/<run-dir>/NOTES.md`, commit it, and repeat its summary in the final response.

### 4. Authorship (`<harness>-<model>`)

At the root of the prototype code directory (`prototypes/<run-dir>/`), write one file named `<harness>-<model>` indicating the harness and model that built the prototype (e.g. `cursor-grok-4.7` or `antigravity-gemini-3.8-flash`). Inside, write a single line repeating that pair.

### 5. Orientation Comments

Orientation comments exist to put the educational guidelines from **[Guiding Principles for C/C++ Developers](#guiding-principles-for-cc-developers)** into practice. They give developers with a systems background immediate orientation without turning the code into a lecture.

**The Rule:**
Whenever code involves the areas outlined in Section 2—**Execution Boundaries** (clarifying where code runs: server-only, client-only, or universal SSR) or **Implicit Mechanics** (demystifying framework behavior: auto-imports, file-based routing, reactive proxies, or network hops)—add an explanatory orientation comment stating the mechanism or boundary in play.

Do not comment basic programming constructs (`if`, loops, simple arithmetic, routine assignments, or standard function calls).

Examples of the expected style:
```ts
// Server-only Nitro route: runs in Node container with direct DB access (maps to GET /api/tasks)
export default defineEventHandler(async (event) => { ... })

// Nuxt auto-import: reactive state proxy (dependency-tracked, unwrapped in template)
const activeTask = ref<Task | null>(null)
```

### 6. Documentation (`docs/<run-dir>/`)

Every prototype maintains its technical documentation inside the project root's `docs/<run-dir>/` directory:

- `docs/<run-dir>/design.md`: A brief description of the prototype. Include a simple Mermaid flowchart showing how data flows:
  `Host Browser -> Nuxt SSR/Client -> Nitro API -> Database Container`.
- `docs/<run-dir>/frontend.md`: Plain-language explanation of UI state management, component breakdown, and what triggers re-renders.
- `docs/<run-dir>/backend.md`: Explanation of server endpoints, data validation, database schemas/queries, and response structures.
- `docs/<run-dir>/NOTES.md`: Short summary following the standard sections:
  1. **Run**: Brief, assigned ports, and how to start/seed it.
  2. **What it shows**: 2-3 sentences summarising the outcome.
  3. **Open questions touched**: Spec questions explored and findings.
  4. **Added**: Any fixtures, models, or fields introduced.
  5. **Stack assumptions**: Databases, drivers, or libraries chosen.
  6. **Cut**: Any scope trimmed to fit the time box.
  7. **Numbers**: Any timings or performance measurements.

### 7. Scoped Git Workflow

Follow Conventional Commits using the `.agents/skills/git-commit` guidelines. Commit messages should have a clear scope identifying the modified component or prototype:

Commit only your own prototype code and documentation directories. The commit message scope **must** identify the run directory, and git commands **must** use the pathspecs `-- prototypes/<run-directory> docs/<run-directory>`:

```bash
git add prototypes/<run-directory> docs/<run-directory>
git commit -m "<type>(<run-directory>,<scope>): <what this chunk does>" -- prototypes/<run-directory> docs/<run-directory>
```

For a prototype in `run-06`:
```bash
git add prototypes/run-06 docs/run-06
git commit -m "feat(run-06,ui): render kanban board columns" -- prototypes/run-06 docs/run-06
```

#### Why this matters:
1. **History Scoping:** The `<type>(<run-directory>,<scope>)` format allows immediate identification of which prototype a commit belongs to in `git log --oneline`.
2. **Pathspec Isolation:** Passing `-- prototypes/<run-directory> docs/<run-directory>` ensures git commits **only** changes inside that prototype and its documentation, preventing accidentally bundling unstaged files from other runs or root platform configuration.
3. **Atomic Changes:** Code changes and their corresponding technical documentation are versioned together in a single atomic commit.
4. **Filtered Log Queries:** Developers can run `git log -- prototypes/<run-directory> docs/<run-directory>` to view the exact history of a single prototype without noise from concurrent prototypes.
5. **No Blanket Adds:** Never run `git add -A`, `git add .`, or `git commit` without a path argument.

### 8. Agent Skills

- `git-commit` (`.agents/skills/git-commit/SKILL.md`): Format commit messages following Conventional Commits.
- `modern-web-guidance` (`.agents/skills/modern-web-guidance/SKILL.md`): Guidance for HTML, CSS, and client-side JS APIs.
