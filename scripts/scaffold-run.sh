#!/usr/bin/env bash
# scripts/scaffold-run.sh
# Scaffolds an isolated prototype run from prototypes/template
set -euo pipefail

RAW_RUN="${1:-}"
DB="${2:-hybrid}"

# Reject retired keyword 'both'
if [[ "$DB" == "both" ]]; then
  echo "Error: 'both' has been retired. Use 'DB=hybrid' to provision both PostgreSQL and MongoDB." >&2
  exit 1
fi

if [[ "$DB" != "hybrid" && "$DB" != "postgres" && "$DB" != "mongo" && "$DB" != "none" ]]; then
  echo "Error: Unknown DB value '$DB'. Valid options: hybrid, postgres, mongo, none." >&2
  exit 1
fi

# Normalize RUN: accepts 100, run-100, 142, run-142, etc. (range 100-999)
if [[ "$RAW_RUN" =~ ^[0-9]+$ ]]; then
  NUM="$RAW_RUN"
elif [[ "$RAW_RUN" =~ ^run-([0-9]+)$ ]]; then
  NUM="${BASH_REMATCH[1]}"
else
  echo "Error: Invalid or missing RUN argument '$RAW_RUN'." >&2
  echo "Usage: make new RUN=100 (or RUN=run-100) [DB=hybrid|postgres|mongo|none]" >&2
  exit 1
fi

if (( 10#$NUM < 100 || 10#$NUM > 999 )); then
  echo "Error: RUN number must be between 100 and 999 (received '$RAW_RUN')." >&2
  exit 1
fi

RUN=$(printf "run-%03d" "$((10#$NUM))")

TARGET_DIR="prototypes/$RUN"
DOCS_TARGET_DIR="docs/$RUN"

if [[ -d "$TARGET_DIR" ]]; then
  echo "Error: Directory '$TARGET_DIR' already exists." >&2
  exit 1
fi

if [[ -d "$DOCS_TARGET_DIR" ]]; then
  echo "Error: Documentation directory '$DOCS_TARGET_DIR' already exists." >&2
  exit 1
fi

if grep -E "^  ${RUN}:" docker-compose.yml >/dev/null 2>&1; then
  echo "Error: Service '$RUN' is already defined in docker-compose.yml." >&2
  exit 1
fi

# 1. Compute external port: 3000 + N (e.g. run-100 -> 3100)
NUM="${RUN#run-}"
PORT=$((3000 + 10#$NUM))

if (( PORT < 1 || PORT > 65535 )); then
  echo "Error: Computed port $PORT is outside the valid range 1-65535." >&2
  exit 1
fi

echo "==> Scaffolding prototype '$RUN' on port $PORT..."

# 2. Copy template into prototypes/$RUN (excluding runtime files)
rsync -rlptD \
  --no-owner \
  --no-group \
  --exclude 'node_modules' \
  --exclude '.nuxt' \
  --exclude '.output' \
  --exclude '.data' \
  --exclude '.env' \
  prototypes/template/ "$TARGET_DIR/"

# 3. Create run-specific .env file (optional local overrides)
DB_NAME="proto_${RUN//-/_}"
ENV_FILE="$TARGET_DIR/.env"

cat <<EOF > "$ENV_FILE"
# Environment configuration for $RUN
# (Inside Docker containers, DB credentials and hostnames are inherited from the root .env)
PORT=$PORT
DB_NAME=$DB_NAME
EOF

echo "Created '$ENV_FILE' with PORT=$PORT and DB_NAME=$DB_NAME."

# 4. Initialize prototype documentation in docs/$RUN
if [[ -d "docs/template" ]]; then
  mkdir -p "$DOCS_TARGET_DIR"
  cp -r docs/template/* "$DOCS_TARGET_DIR/"
  for f in "$DOCS_TARGET_DIR"/*.md; do
    if [[ -f "$f" ]]; then
      sed -i "s/{{RUN}}/$RUN/g" "$f"
      sed -i "s/{{PORT}}/$PORT/g" "$f"
      sed -i "s/{{DB_NAME}}/$DB_NAME/g" "$f"
    fi
  done
  echo "Initialized run documentation in '$DOCS_TARGET_DIR'."
fi

# 5. Inject service block into docker-compose.yml before the top-level 'volumes:' section
python3 - <<EOF
with open('docker-compose.yml', 'r') as f:
    content = f.read()

target = '\nvolumes:\n'
service_block = '''  $RUN:
    extends:
      service: base-proto
    profiles: ["$RUN", "all"]
    ports:
      - "$PORT:$PORT"
    environment:
      - PORT=$PORT
      - DB_NAME=$DB_NAME
    volumes:
      - ./prototypes/$RUN:/app
      - type: volume
        source: pnpm_store
        target: /app/node_modules
        volume:
          subpath: $RUN/node_modules

'''

if target not in content:
    raise SystemExit('Error: Could not locate top-level volumes: section in docker-compose.yml')

new_content = content.replace(target, '\n' + service_block + 'volumes:\n')
with open('docker-compose.yml', 'w') as f:
    f.write(new_content)
EOF

echo "Added service '$RUN' (port $PORT:$PORT) to docker-compose.yml."

# 5b. Pre-seed shared pnpm volume subpaths if Docker engine is accessible
if docker compose ps >/dev/null 2>&1; then
  docker compose run --rm -T --no-deps pnpm-init sh -c "mkdir -p /pnpm_store/store /pnpm_store/$RUN/node_modules" 2>/dev/null || true
fi

# 6. Database provisioning (cold-start SQL + live container provisioning)
if [[ "$DB" == "postgres" || "$DB" == "hybrid" ]]; then
  SQL_FILE="docker/postgres/init/01-create-databases.sql"
  if [[ -f "$SQL_FILE" ]] && ! grep -q "CREATE DATABASE $DB_NAME;" "$SQL_FILE"; then
    echo "CREATE DATABASE $DB_NAME;" >> "$SQL_FILE"
    echo "Appended 'CREATE DATABASE $DB_NAME;' to $SQL_FILE (for cold starts)."
  fi

  # Dynamic provisioning on running container (avoids Postgres initdb trap)
  if docker compose ps postgres --status running -q 2>/dev/null | grep -q .; then
    # Read root DB credentials
    USER="lerch"
    if [[ -f .env ]]; then
      # shellcheck disable=SC1091
      source .env
      USER="${DB_USER:-lerch}"
    fi
    echo "Checking live PostgreSQL container for '$DB_NAME'..."
    EXISTS=$(docker compose exec -T postgres psql -U "$USER" -d default_db -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null | tr -d '[:space:]' || true)
    if [[ "$EXISTS" != "1" ]]; then
      echo "Creating database '$DB_NAME' on running PostgreSQL container..."
      docker compose exec -T postgres psql -U "$USER" -d default_db -c "CREATE DATABASE $DB_NAME;"
      echo "Database '$DB_NAME' created successfully on running PostgreSQL."
    else
      echo "Database '$DB_NAME' already exists on running PostgreSQL."
    fi
  else
    echo "Notice: PostgreSQL container is not running. Database will be created on next volume initialization from $SQL_FILE."
  fi
fi

if [[ "$DB" == "mongo" || "$DB" == "hybrid" ]]; then
  echo "Notice: MongoDB creates collections and databases lazily on first document write."
fi

echo "==> Prototype '$RUN' successfully scaffolded!"
echo "    Start container:  make up RUN=$RUN"
echo "    Seed database:    make seed RUN=$RUN"
echo "    Browse UI:        http://localhost:$PORT"
echo "    Documentation:    docs/$RUN/"
