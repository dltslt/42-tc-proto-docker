# `ft_transcendence`: Lerch Prototypes (Docker)

This repository is `tc-proto-docker`. It holds the Lerch prototypes in an orchestrated Docker environment moving toward product stage.

Lerch is a task and project tool built for a team first. It is a hub for the next relevant piece of work: it stays out of the way, and an ordinary change takes the fewest steps. The core is items, their relations, and a space.

A prototype is also a lesson. The team and readers learned software engineering in the 42 curriculum, primarily in C and C++. They are learning Nuxt, Vue, TypeScript, and modern web architectures. Write the code, comments, and documentation so a developer with a systems background can read a prototype and immediately understand what the framework does and where the code runs.

```text
.
├── AGENTS.md            the rule every prototype agent follows, including how to commit
├── README.md            repository overview, quick start, and curriculum roadmap
├── PROMPT.md            the harness prompt that starts a run; names a run and a brief
├── specs/               product context and domain data invariants for prototypes
├── briefs/              one brief per prototype defining the scenario to evaluate
├── docs/                technical documentation and prototype run documentation
│   ├── README.md        master documentation index and curriculum guide
│   ├── docker/          platform and container architecture deep-dives
│   ├── template/        starter documentation templates for prototype runs
│   └── run-XXX/         documentation for prototype run-XXX (design.md, NOTES.md, etc.)
├── prototypes/
│   ├── template/        the baseline Nuxt app every prototype starts from; do not build here
│   └── run-XXX/         isolated prototype runs (run-100/, run-101/, etc.)
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
  - Developers and browsers on the host access prototypes via mapped ports (`http://localhost:3100` for `run-100`, `3101` for `run-101`).
  - Host database tools connect to PostgreSQL on port `5433` (mapped from container `5432` to avoid host conflicts) and MongoDB on port `27017`.

### 2. De-mystifying the "Magic" (Implicit Mechanics)
- **Auto-imports**: In C, missing an `#include` is a compile error. Nuxt automatically imports Vue primitives (`ref`, `computed`, `watch`), Nuxt composables (`useFetch`, `useRoute`, `useRouter`), and components located in `components/` without explicit `import` statements.
- **File-based routing**: Endpoints and pages are registered purely by filesystem location. For example, `server/api/tasks/[id].get.ts` automatically registers `GET /api/tasks/:id`.
- **Reactivity vs. Imperative Flow**: Vue's `ref()` and `computed()` are reactive proxies tracking dependencies, not raw static memory locations. In `<script setup>`, access the underlying value using `.value`. In `<template>`, Vue unwraps `.value` automatically.

---

## Core Domain Concepts

Read product vision, baseline mechanics, and domain invariants defined in [`specs/`](specs/):

- **[`specs/product-short-v2.md`](specs/product-short-v2.md)**: Product vision, the 4 baseline mechanics (`Spaces & actors`, `Items & recursive hierarchy`, `Progressive creation`, `State & kanban`), on-demand exploration directions, and working rules.
- **[`specs/data-foundation.md`](specs/data-foundation.md)**: The 8 core domain invariant groups (`Space`, `Actor`, `Item`, `Hierarchy`, `Blocker`, `Tag`, `Artifact`, `Event`), their minimum invariant fields, run-specific refinements, and open architectural dimensions.

---

## The Database

The prototypes evaluate relational, document-oriented, and hybrid representations of the core Lerch domain. See [`specs/data-foundation.md`](specs/data-foundation.md) for the entity invariants and open schema dimensions.

### Shared Container Engines & Connection URLs

Database services run centrally in Docker Compose:
- **PostgreSQL 16 Alpine**: Service `postgres:5432` (host port `5433`).
- **MongoDB 7**: Service `mongo:27017` (host port `27017`).

Individual prototypes inherit global credentials from the root `.env` via `base-proto`. Inside each prototype run, connection URLs are dynamically assembled using `process.env.DB_NAME` (e.g. `proto_run_100`):
- **PostgreSQL**: `postgresql://${DB_USER}:${DB_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${DB_NAME}`
- **MongoDB**: `mongodb://${DB_USER}:${DB_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/${DB_NAME}?authSource=admin`

### The Programmatic Seeding Contract (`pnpm db:seed`)
Every prototype implements `package.json` with `"db:seed": "tsx server/seed.ts"`. Seeding is invoked via:
```bash
make seed RUN=100    # Executes 'pnpm run db:seed' inside container run-100
```

### The Seeding Rules

- **Mandatory for DB runs:** If a prototype uses a database (`DB=hybrid`, `postgres`, or `mongo`), authoring `server/seed.ts` and executing `make seed RUN=XXX` is **mandatory**. Scaffolding only creates an empty database and a skeleton connectivity check; you must define tables/collections and insert initial fixtures.
- **Strict Idempotency:** The seed script must be safe to run repeatedly over an already-seeded database (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING` or upserts, checking existing MongoDB documents). Running `make seed` multiple times must never crash or create duplicate records.

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
2. The product context (`specs/product-short-v2.md`) and data foundation (`specs/data-foundation.md`).

**Prototype Isolation & Working Directory Boundaries:**
- **Code Directory**: Write prototype code **strictly** inside `prototypes/<run-dir>/` (e.g. `prototypes/run-100/`).
- **Documentation Directory**: Write prototype documentation **strictly** inside `docs/<run-dir>/` (e.g. `docs/run-100/`).
- **Brief File**: Read or create only `briefs/<run-dir>.md` (e.g. `briefs/run-100.md`).
- **Platform Registration**: `make new` modifies root orchestration files (`docker-compose.yml` and, for Postgres/hybrid runs, `docker/postgres/init/01-create-databases.sql`). Committing these modifications during initial scaffolding is expected and required so the stack functions cleanly after a fresh clone.
- Do not edit `prototypes/template/`, `docs/template/`, `specs/`, other files in `briefs/`, `AGENTS.md`, `README.md`, `PROMPT.md`, or other prototype directories.
- Do not inspect, search, or diff any other prototype directory. Search only inside your designated run and docs directories. An empty "Findings from earlier runs" section in a brief stays empty unless explicitly filled by hand.

### 2. Briefs: Read & Build vs. Prompt & Save

Every prototype run corresponds to a 3-digit run number (`100..999`, directory `prototypes/run-XXX`) and a brief in `briefs/run-XXX.md`. If no 3-digit `RUN` number was provided, ask the user for it first!

There are two ways a run starts:

1. **Read & Build (Brief already exists):** If `briefs/run-XXX.md` already exists, read that brief and build the prototype it specifies.
2. **Prompt & Save (Idea described in prompt):** If `briefs/run-XXX.md` is missing, the user's prompt becomes the brief (if no idea was given yet, ask the user what to build). **Before writing any prototype code**, write `briefs/run-XXX.md` capturing the scenario/idea, what to build, and the "Done when" criteria, and commit it with the run.

### 3. Control Plane (`make`) & Step-by-Step Workflow

If the prototype directory (`prototypes/run-XXX/`) does not exist or its container is not running, set up the work environment using the `Makefile` targets:

```bash
make new RUN=100 [DB=hybrid|postgres|mongo|none]  # Scaffolds prototypes/run-100 and docs/run-100
make up RUN=100                                   # Starts container (http://localhost:3100) and DBs
make seed RUN=100                                 # Executes pnpm run db:seed inside container
make ps RUN=100                                   # Checks container status
make logs RUN=100                                 # Tails container logs
```

**Workflow Steps:**
1. **Environment & Brief:** Scaffold the run (`make new RUN=XXX [DB=...]`) if it doesn't exist and verify or create `briefs/<run-dir>.md`. When your brief and product context or data foundation disagree, the brief wins.
2. **Authorship & Scaffold Commit:** Create the `<harness>-<model>` file at the prototype code root (`prototypes/<run-dir>/<harness>-<model>`). Commit the initial scaffolded directory, harness file, docs template, brief (if newly created), and platform registration files (`docker-compose.yml` and `01-create-databases.sql` if modified) using the initial scaffold commit pattern in Section 7 applying the `git-commit` skill.
3. **Deconstruct:** Split the slice into small, digestible chunks that a reviewer can read as a single concept.
4. **Incremental Implementation:** Build chunk by chunk. Add 1-line orientation comments for framework mechanisms. Commit each chunk using the scoped git workflow and `git-commit` skill.
5. **Database Seeding:** For DB runs, implement `server/seed.ts` and run `make seed RUN=XXX`.
6. **Documentation:** Maintain `docs/<run-dir>/design.md`, `docs/<run-dir>/frontend.md`, and `docs/<run-dir>/backend.md`. Update them as design evolves.
7. **Browser Verification:** Verify every criteria under "Done when" in the brief directly in the browser (`http://localhost:3XXX`) against the live seeded database state. Verify that running `make seed RUN=XXX` again is cleanly idempotent.
8. **Wrap-up:** Write `docs/<run-dir>/NOTES.md`, commit it, and repeat its summary in the final response.

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

Following Conventional Commits using the `.agents/skills/git-commit` guidelines is mandatory. Commit messages have a clear scope identifying the modified component or prototype. These commands are **pathspec and scoping examples** showing how to isolate files and format the commit scope only:

#### A. Initial Scaffold Commit
Scaffolding via `make new` modifies root orchestration files so that the prototype can run immediately after a clean clone. Commit the initial scaffolded files, docs, and modified orchestration files:

```bash
# Include docker/postgres/init/01-create-databases.sql if Postgres/hybrid; include briefs/<run-directory>.md if newly created:
git add prototypes/<run-directory> docs/<run-directory> docker-compose.yml \
  docker/postgres/init/01-create-databases.sql briefs/<run-directory>.md
git commit -m "chore(<run-directory>,scaffold): scaffold prototype and register service" -- \
  prototypes/<run-directory> docs/<run-directory> docker-compose.yml \
  docker/postgres/init/01-create-databases.sql briefs/<run-directory>.md
```

#### B. Subsequent Implementation Chunks
For all subsequent implementation chunks, commit **strictly** prototype code and documentation. Git commands **must** use explicit pathspecs (`-- prototypes/<run-directory> docs/<run-directory>`):

```bash
git add prototypes/<run-directory> docs/<run-directory>
git commit -m "<type>(<run-directory>,<scope>): <what this chunk does>" -- prototypes/<run-directory> docs/<run-directory>
```

For a prototype in `run-106`:
```bash
git add prototypes/run-106 docs/run-106
git commit -m "feat(run-106,ui): render kanban board columns" -- prototypes/run-106 docs/run-106
```

#### Why this matters:
1. **History Scoping:** The `<type>(<run-directory>,<scope>)` format allows immediate identification of which prototype a commit belongs to in `git log --oneline`.
2. **Clone Reproducibility:** Including platform registration files (`docker-compose.yml` and conditional `01-create-databases.sql`) in the scaffold commit guarantees that any fresh `git clone` can immediately run `make init`, `make up`, and `make seed` without missing container services or uninitialized databases.
3. **Pathspec Isolation:** Passing explicit pathspecs prevents accidentally bundling unstaged changes from other runs or untracked local experiments. After the initial scaffold commit, no root files may be included in commits.
4. **Atomic Changes:** Code changes and their corresponding technical documentation are versioned together in a single atomic commit.
5. **Filtered Log Queries:** Developers can run `git log -- prototypes/<run-directory> docs/<run-directory>` to view the exact history of a single prototype without noise from concurrent prototypes.
6. **No Blanket Adds:** Never run `git add -A`, `git add .`, or `git commit` without a path argument.

### 8. Agent Skills

- `git-commit` (`.agents/skills/git-commit/SKILL.md`): Format commit messages following Conventional Commits (changelog subjects, bullet bodies, attribution trailer).
- `modern-web-guidance` (`.agents/skills/modern-web-guidance/SKILL.md`): Guidance for HTML, CSS, and client-side JS APIs.
