# Control Plane Operations Manual

This guide documents the developer control plane and automation CLI for `tc-proto-docker`.

---

## 1. Overview of the Control Plane

All lifecycle operations are orchestrated via standard `make` commands. This abstracts complex Docker Compose flags, profile selections, container environment variables, and execution parameters into simple, reproducible developer workflows.

```text
Developer Shell
      |
      v
   Makefile (make <command> RUN=<n>)
      |
      +---> scripts/scaffold-run.sh (Code & doc scaffolding, Compose injection, DB creation)
      +---> docker compose (Profile orchestration, volume lifecycle)
      +---> tsx server/seed.ts (Programmatic database seeding contract)
```

---

## 2. Command Reference

### `make init`
Initializes the entire development environment after a fresh clone when existing prototype runs are present.
```bash
make init
```
1. Creates `.env` from `.env.example` if it does not exist.
2. Pulls base images (`postgres:16-alpine`, `mongo:7`, and Node builder).
3. Boots PostgreSQL and MongoDB database engines.
4. Iterates over any existing prototype directories in `prototypes/` (`run-*`) and seeds their logical databases.
5. Shuts down containers cleanly.

> [!NOTE]
> `make init` is only needed when the repository already contains scaffolded prototype runs (e.g. after cloning a repository or branch that contains `run-100/`). If starting fresh with no runs present, there are no databases to seed — skip `make init` and proceed directly to `make new RUN=100`.

---

### `make new`
Scaffolds a new, isolated prototype run.
```bash
make new RUN=100 [DB=hybrid|postgres|mongo|none]
```
- **Arguments**:
  - `RUN`: Number or identifier (`100`, `run-100`, etc., range `100..999`).
  - `DB`: (Optional, default `hybrid`). Database provisioning mode (`hybrid`, `postgres`, `mongo`, `none`).
- **Actions Performed**:
  1. Computes deterministic external port: `PORT = 3000 + N` (e.g., `RUN=100` -> `3100`).
  2. Copies `prototypes/template/` into `prototypes/run-XXX/` (excluding build artifacts and `.env`).
  3. Copies `docs/template/` into `docs/run-XXX/` to initialize run documentation.
  4. Creates `prototypes/run-XXX/.env` with `PORT` and `DB_NAME`.
  5. Injects the new service into `docker-compose.yml` with `extends: base-proto` and profile `run-XXX`.
  6. Provisions the logical database dynamically on the running PostgreSQL instance and updates `docker/postgres/init/01-create-databases.sql`.

---

### `make up`
Starts a specific prototype container and its database dependencies.
```bash
make up RUN=100
# Or start the template reference container:
make up RUN=template
```
- Activates Docker Compose profile `run-XXX`.
- Automatically starts `postgres` and `mongo` if not already running.
- Runs detached in the background.

---

### `make up-all`
Starts all registered prototype containers simultaneously.
```bash
make up-all
```
- Activates Docker Compose profile `all`.

---

### `make ps`
Lists running containers across the entire Docker Compose stack or targets a specific prototype.
```bash
make ps             # Lists all active containers (PostgreSQL, MongoDB, active prototypes)
make ps RUN=100     # Checks container status for run-100
```
- Uses `docker compose --profile "*"` to inspect all profiled services and shared engines.

---

### `make seed`
Executes the programmatic database seeding contract inside the prototype container.
```bash
make seed RUN=100
# Or seed the template:
make seed RUN=template
```
- Connects to the running container and executes `pnpm run db:seed`.
- Idempotently creates tables, collections, and initial fixture records.

---

### `make logs` & `make logs-all`
Tails stdout and stderr logs from running containers.
```bash
make logs RUN=100   # Follows logs for run-100
make logs-all       # Follows logs across all running prototype containers
```

---

### `make sh`
Spawns an interactive shell inside a running prototype container.
```bash
make sh RUN=100
```
- Opens `/bin/sh` inside `/app` in container `run-100` for debugging.

---

### `make down`
Stops all running prototype containers and database engines cleanly.
```bash
make down
```

---

### `make db-reset`
Completely wipes all database volumes and reinitializes PostgreSQL and MongoDB from scratch.
```bash
make db-reset
```
> [!CAUTION]
> This destroys all persisted database state in Docker volumes `tc-proto-docker_postgres_data` and `tc-proto-docker_mongo_data`. Fresh volumes will be initialized on next startup using scripts in `docker/postgres/init/`.

---

## 3. The Programmatic Seeding Contract (`pnpm db:seed`)

Every prototype repository must provide a self-healing, automated seed script defined in `package.json`:

```json
{
  "scripts": {
    "db:seed": "tsx server/seed.ts"
  }
}
```

### The Idempotency Contract
A seed script must be **idempotent**: running `make seed RUN=XXX` multiple times must not produce duplicate records or database errors.

1. **Schema Verification**:
   - For PostgreSQL: Execute `CREATE TABLE IF NOT EXISTS ...` or verify table schemas before inserting.
   - For MongoDB: Use `db.collection(...)` or `db.createCollection(...)` with unique indexes (`createIndex({ key: 1 }, { unique: true })`).
2. **Fixture Seeding**:
   - Insert baseline spaces, actors, columns, and task items.
   - If fixtures already exist, either perform an `UPSERT` (`ON CONFLICT DO UPDATE`) or exit cleanly.
3. **Exit Codes**:
   - Exit with code `0` on success.
   - Exit with a non-zero code if database connectivity fails or an unrecoverable SQL/Mongo error occurs.

---

## 4. Direct Database Inspection & Debugging

Developers can inspect database state directly using container CLIs or host GUI clients.

### PostgreSQL Direct Access
- **Via Docker Container CLI**:
  ```bash
  docker compose exec postgres psql -U lerch -d proto_run_100
  ```
- **Via Host Client (GUI / Local psql)**:
  Connect to `localhost:5433` (note host port `5433`):
  - **Host**: `localhost`
  - **Port**: `5433`
  - **Database**: `proto_run_100` (or `default_db`)
  - **User**: `lerch`
  - **Password**: `secretpassword`

### MongoDB Direct Access
- **Via Docker Container CLI**:
  ```bash
  docker compose exec mongo mongosh -u lerch -p secretpassword --authenticationDatabase admin proto_run_100
  ```
- **Via Host Client (Compass / mongosh)**:
  Connect to `mongodb://lerch:secretpassword@localhost:27017/proto_run_100?authSource=admin`.

