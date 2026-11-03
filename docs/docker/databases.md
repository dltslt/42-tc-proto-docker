# Hybrid Database Architecture & Dynamic Provisioning

This guide details the dual-database architecture of `tc-proto-docker`. It covers the hybrid relational/document model, dynamic URL resolution in Node, and how the platform bypasses the PostgreSQL `initdb` trap during dynamic prototype scaffolding.

---

## 1. The Hybrid Relational & Document Model

Lerch prototypes evaluate both relational and document-oriented paradigms. While early benchmark briefs (`fast-02` vs. `fast-03`) evaluated SQL versus MongoDB in isolation, production requirements benefit from a **Hybrid Split**:

- **Relational Domain (PostgreSQL 16)**:
  - Well-suited for structured administrative boundaries, users, workspaces, memberships, and strict role-based access policies (`can(actor, action, resource)`).
  - Benefits from ACID transactions, strict foreign keys (`ON DELETE CASCADE`), and normalized relational integrity.
- **Document Domain (MongoDB 7)**:
  - Well-suited for polymorphic task hierarchies, arbitrary nested subtasks, directed blocker dependency graphs, dynamic tags, and event streams.
  - Benefits from flexible document schemas, embedded arrays, and rapid JSON aggregation pipelines.

In `tc-proto-docker`, **both database engines run concurrently** on the shared Docker bridge network:
- `postgres:5432` (PostgreSQL 16 Alpine)
- `mongo:27017` (MongoDB 7)

A single Nuxt 4 / Nitro application can open connections to both engines simultaneously:
- `server/utils/pg.ts` manages a PostgreSQL connection pool (`pg.Pool`).
- `server/utils/mongo.ts` manages a MongoDB connection client (`MongoClient`).

---

## 2. Dynamic Connection Resolution (Zero Hardcoded Credentials)

A common security and architectural anti-pattern in prototype setups is hardcoding database passwords and connection strings directly into individual prototype configurations.

In `tc-proto-docker`, credentials and connection strings are **dynamically assembled at runtime**:

### Architecture of Environment Inheritance

1. **Root `.env` (Single Source of Truth)**:
   Contains global database credentials and internal network hostnames:
   ```env
   DB_USER=lerch
   DB_PASSWORD=secretpassword
   POSTGRES_HOST=postgres
   POSTGRES_PORT=5432
   MONGO_HOST=mongo
   MONGO_PORT=27017
   HOST_POSTGRES_PORT=5433
   ```
2. **Inheritance in `docker-compose.yml` (`base-proto`)**:
   ```yaml
   base-proto:
     env_file:
       - .env
   ```
   Every prototype automatically inherits these database credentials inside its container environment.
3. **Prototype Scaffolding (`prototypes/run-XXX/.env`)**:
   Individual prototype runs specify only what makes them unique:
   ```env
   PORT=3100
   DB_NAME=proto_run_100
   ```
4. **Dynamic Assembly in Node / Nitro**:
   In `server/seed.ts` (and application database utilities), connection strings are constructed dynamically from the inherited environment:
   ```ts
   // Construct PostgreSQL connection URL dynamically
   const pgUser = process.env.DB_USER || 'lerch'
   const pgPass = process.env.DB_PASSWORD || 'secretpassword'
   const pgHost = process.env.POSTGRES_HOST || 'postgres'
   const pgPort = process.env.POSTGRES_PORT || '5432'
   const postgresUrl = process.env.POSTGRES_URL || 
     `postgresql://${pgUser}:${pgPass}@${pgHost}:${pgPort}/${dbName}`

   // Construct MongoDB connection URL dynamically
   const mongoHost = process.env.MONGO_HOST || 'mongo'
   const mongoPort = process.env.MONGO_PORT || '27017'
   const mongoUrl = process.env.MONGO_URL || 
     `mongodb://${pgUser}:${pgPass}@${mongoHost}:${mongoPort}/${dbName}?authSource=admin`
   ```

**Benefits**:
- Changing the database password in the root `.env` updates all running prototypes immediately.
- Prototypes can never accidentally commit secrets or mismatched credentials to source control.
- If an agent or cloud deploy provides an explicit `POSTGRES_URL` or `MONGO_URL`, the fallback priority honors the explicit variable.

---

## 3. The PostgreSQL `initdb` Trap and Dynamic Provisioning

When using the official PostgreSQL Docker image, developers often rely on the `/docker-entrypoint-initdb.d/` directory. Any `.sql` or `.sh` script placed here is automatically executed when the container starts.

### The Trap: `initdb` Runs Only Once
The PostgreSQL container's entrypoint script explicitly checks if the database data directory (`/var/lib/postgresql/data`) contains an existing `PG_VERSION` file.
- If the directory is empty, it runs `initdb` and executes all scripts in `/docker-entrypoint-initdb.d/`.
- **If the directory already contains initialized database files, the scripts in `/docker-entrypoint-initdb.d/` are completely ignored.**

If a developer runs `make up` (creating the shared volume), and later runs `make new RUN=102`, simply appending `CREATE DATABASE proto_run_102;` to the initialization SQL script will **not** create the database, because PostgreSQL is already initialized.

### The Dual-Action Solution in `scaffold-run.sh`

To guarantee seamless provisioning whether the stack is cold or already running, `scripts/scaffold-run.sh` performs two actions:

1. **Cold-Start Persistence**:
   Appends `CREATE DATABASE proto_run_XXX;` to `docker/postgres/init/01-create-databases.sql`. If the entire stack is destroyed and recreated (`make db-reset`), all databases are recreated on the fresh volume.
2. **Live Dynamic Provisioning**:
   Checks if the PostgreSQL container is currently running via `docker compose ps`. If active, it issues an immediate `CREATE DATABASE` query directly over the container control plane:
   ```bash
   EXISTS=$(docker compose exec -T postgres psql -U "$USER" -d default_db \
     -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | tr -d '[:space:]')
   if [[ "$EXISTS" != "1" ]]; then
     docker compose exec -T postgres psql -U "$USER" -d default_db \
       -c "CREATE DATABASE $DB_NAME;"
   fi
   ```

### MongoDB Lazy Provisioning
Unlike PostgreSQL, MongoDB does not require an explicit `CREATE DATABASE` command. MongoDB creates logical databases and collections lazily upon the first write operation (`insertOne`, `createCollection`).

---

## 4. Database Provisioning Modes

When scaffolding a run via `make new`, developers select one of four provisioning modes:

```bash
make new RUN=100 DB=hybrid    # Provisions both PostgreSQL and MongoDB (Default)
make new RUN=101 DB=postgres  # Provisions only PostgreSQL (pure SQL benchmark)
make new RUN=102 DB=mongo     # Provisions only MongoDB (pure document benchmark)
make new RUN=103 DB=none      # Pure client-side or mocked memory prototype
```

> [!WARNING]
> The keyword `both` has been **permanently retired**. Always use `DB=hybrid`.

