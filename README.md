# Containerized Nuxt 4 Prototyping Platform

> [!NOTE]
> **Authorship & Provenance**
> This repository, including its architecture, orchestration, automation scripts, and technical documentation, was written by **Antigravity (Gemini 3.8 Flash)** in collaboration with the team.

This repository provides an orchestrated, containerized prototyping platform built around our team's specific project for **`ft_transcendence`**. It enables rapid full-stack exploration, benchmarking, and architectural evaluation through concurrent execution of multiple isolated [Nuxt 4](https://nuxt.com/) prototype instances backed by shared [PostgreSQL 16](https://www.postgresql.org/) and [MongoDB 7](https://www.mongodb.com/) container engines on a private Docker bridge network.

It is not intended as a generic tool to directly assist every 42 student, but rather as an **idea and architectural blueprint** of how a containerized prototyping environment can be structured. Our team uses this environment as a shared lab for iterating on ideas and evaluating patterns. While the overall design and core files (such as domain models, briefs, and agent guidelines) are directly tied to our team's project design, the platform serves as an active engineering testbed and an educational reference for developers with a systems programming background (C/C++ in the 42 curriculum) transitioning into modern full-stack web, reactivity, containerization, and multi-model database architectures.

```text
.
├── AGENTS.md            the rule every prototype agent follows, including how to commit
├── README.md            this file: repository overview, quick start, and curriculum roadmap
├── PROMPT.md            the harness prompt that starts a run; names a run and a brief
├── specs/               product context and domain data invariants for prototypes
├── briefs/              one brief per prototype defining the scenario to evaluate
├── docs/                technical documentation and prototype run documentation
│   ├── README.md        master documentation index and curriculum guide
│   ├── docker/          platform and container architecture deep-dives
│   ├── template/        starter documentation templates for prototype runs
│   └── run-XXX/         documentation for prototype run-XXX (design.md, NOTES.md, etc.)
├── prototypes/
│   ├── template/        baseline Nuxt 4 prototype blueprint; do not build here
│   └── run-XXX/         isolated prototype runs (run-100/, run-101/, etc.)
├── docker/              database initialization scripts and container configs
├── scripts/             scaffolding and control plane automation scripts
└── .agents/             agent skills for git commits and modern web guidance
```

---

## Technical Architecture & Curriculum Deep Dives

This platform serves both as an engineering testbed and as a **systems programming lesson** for developers with C/C++ backgrounds transitioning into modern web and cloud architecture.

Deep-dive documentation is organized in [`docs/`](docs/README.md):

- **[1. Container Architecture & Service Topology](docs/docker/architecture.md)**: Linux namespaces (`pid`, `net`, `mnt`), cgroups, Docker Compose service inheritance (`base-proto`), and profile-based container activation.
- **[2. Node.js Virtualization, Volume Masking & pnpm CAS](docs/docker/pnpm-and-volumes.md)**: Why host and container cannot share `node_modules` (Mach-O vs. ELF binary ABIs, `glibc` forward-incompatibility, root UID permissions), Docker anonymous volume masking, and hard-linked Content-Addressable Storage (CAS) via shared named volume `pnpm_store`.
- **[3. Networking, Ports & Vite HMR](docs/docker/networking-and-ports.md)**: NAT port forwarding, host PostgreSQL port `5433` conflict resolution, and the single 1:1 port architecture (`$PORT:$PORT`) for flawless Vite WebSocket Hot Module Replacement.
- **[4. Hybrid Database Architecture](docs/docker/databases.md)**: Dual persistence model (PostgreSQL for admin/spaces/members, MongoDB for items/trees/events), zero hardcoded credentials, dynamic URL assembly in Node, and overcoming the PostgreSQL `initdb` one-time initialization trap.
- **[5. Control Plane Operations Manual](docs/docker/control-plane.md)**: Complete guide to `make` CLI workflows, container lifecycles, and the programmatic seeding contract (`pnpm db:seed`).

---

## Requirements & Prerequisites

- **Docker Engine**: Version `24.0.0` or newer with **Docker Compose v2** (`docker compose`).
- **Node.js**: (Optional, for local host typechecking) `^22.22.3`, `^24.15.0`, or `26`.
- **pnpm**: (Optional, for host tooling) `12.16.1` or newer. We recommend installing directly via npm:
  ```bash
  npm install -g pnpm@12.16.1
  ```

---

## Quick Start & Workflows

All platform operations are orchestrated through standard `make` targets.

### Path A: Inspecting Existing Runs (Fresh Clone)

> *If starting fresh with no runs in the repo, skip `make init` and proceed directly to Path B.*

If you just cloned a branch containing existing prototype runs (e.g. `prototypes/run-100/`):

```bash
make init           # Bootstraps base images and batch-seeds existing runs (once on clone)
make up RUN=100     # Starts run-100 and DB engines (http://localhost:3100)
```

---

### Path B: Building a New Prototype Run

Choose whichever starting interface fits your workflow:

#### 1. Chat-First (Agent Prompt & Save)
Start directly from your **agent chat** without touching the terminal:
- Prompt: `@PROMPT.md`
- Provide your 3-digit run number (e.g. `100`) and scenario idea. The agent scaffolds the run, authors `briefs/run-100.md`, implements the code, seeds the database, and verifies the UI.
- Open `http://localhost:3100` (or `http://localhost:3XXX` matching your run number).

#### 2. Terminal-First (Scaffold & Build)
Prepare the container and brief in your editor before building:
1. Scaffold code, docs, and database:
   ```bash
   make new RUN=100 DB=hybrid
   make up RUN=100
   ```
2. Write your scenario requirements in `briefs/run-100.md`.
3. Build the prototype:
   - **With an agent:** Prompt `@PROMPT.md 100` in chat.
   - **Manually:** Implement your code, author `server/seed.ts`, and run `make seed RUN=100`.
4. Open `http://localhost:3100`.

---

### Full Target Reference

| Target | Description | Example |
|---|---|---|
| `make init` | Bootstraps & seeds all existing runs (only needed when runs exist) | `make init` |
| `make new` | Scaffolds prototype code (`prototypes/`) & docs (`docs/`) | `make new RUN=100 [DB=hybrid\|postgres\|mongo\|none]` |
| `make up` | Starts a specific prototype container and DB engines | `make up RUN=100` (or `make up RUN=template`) |
| `make up-all` | Starts all scaffolded prototypes simultaneously | `make up-all` |
| `make ps` | Lists running containers in the compose stack | `make ps` (or `make ps RUN=100`) |
| `make seed` | Executes programmatic seeding contract (`server/seed.ts`) | `make seed RUN=100` |
| `make logs` | Tails stdout/stderr logs for a prototype | `make logs RUN=100` |
| `make logs-all` | Tails logs across all running prototype containers | `make logs-all` |
| `make sh` | Opens `/bin/sh` shell inside prototype container | `make sh RUN=100` |
| `make down` | Stops all running containers cleanly | `make down` |
| `make clean` | Removes container and anonymous volumes for a prototype | `make clean RUN=100` |
| `make clean-all` | Stops and removes all containers and volumes across the stack | `make clean-all` |
| `make db-reset` | Wipes database volumes and reinitializes fresh engines | `make db-reset` |

---

## Prototype Documentation Convention

Every prototype run maintains its technical documentation inside `docs/run-XXX/`:
- `docs/run-XXX/design.md`: Architecture overview and Mermaid data flow.
- `docs/run-XXX/frontend.md`: UI state management, components, and re-render triggers.
- `docs/run-XXX/backend.md`: Nitro server routes, database schemas, and queries.
- `docs/run-XXX/NOTES.md`: Standard post-mortem summary, findings, cuts, and benchmark timings.

See [`docs/README.md`](docs/README.md) and [`AGENTS.md`](AGENTS.md) for complete guidelines.
