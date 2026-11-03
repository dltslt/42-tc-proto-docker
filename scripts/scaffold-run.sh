#!/usr/bin/env bash
# scripts/scaffold-run.sh
# Scaffolds an isolated prototype run from prototypes/template
set -euo pipefail

RAW_RUN="${1:-}"
DB="${2:-postgres}"

# Normalize RUN: accepts 1, 01, 42, run-1, run-01, etc.
if [[ "$RAW_RUN" =~ ^[0-9]+$ ]]; then
  RUN=$(printf "run-%02d" "$RAW_RUN")
elif [[ "$RAW_RUN" =~ ^run-([0-9]+)$ ]]; then
  NUM="${BASH_REMATCH[1]}"
  RUN=$(printf "run-%02d" "$NUM")
else
  echo "Error: Invalid or missing RUN argument '$RAW_RUN'." >&2
  echo "Usage: make new RUN=1 (or RUN=42, or RUN=run-01) [DB=postgres|mongo|both|none]" >&2
  exit 1
fi

TARGET_DIR="prototypes/$RUN"

if [[ -d "$TARGET_DIR" ]]; then
  echo "Error: Directory '$TARGET_DIR' already exists." >&2
  exit 1
fi

if grep -E "^  ${RUN}:" docker-compose.yml >/dev/null 2>&1; then
  echo "Error: Service '$RUN' is already defined in docker-compose.yml." >&2
  exit 1
fi

# 1. Compute external port: 3000 + N (e.g. run-01 -> 3001)
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

# 3. Create run-specific .env file
DB_NAME="proto_${RUN//-/_}"
ENV_FILE="$TARGET_DIR/.env"

cat <<EOF > "$ENV_FILE"
# Environment configuration for $RUN
PORT=3000
CLIENT_PORT=$PORT
EOF

if [[ "$DB" == "postgres" || "$DB" == "both" ]]; then
  echo "DATABASE_URL=postgresql://\${POSTGRES_USER:-lerch}:\${POSTGRES_PASSWORD:-secretpassword}@postgres:5432/$DB_NAME" >> "$ENV_FILE"
fi

if [[ "$DB" == "mongo" ]]; then
  echo "DATABASE_URL=mongodb://\${MONGO_USER:-lerch}:\${MONGO_PASSWORD:-secretpassword}@mongo:27017/$DB_NAME?authSource=admin" >> "$ENV_FILE"
fi

if [[ "$DB" == "both" ]]; then
  echo "MONGO_URL=mongodb://\${MONGO_USER:-lerch}:\${MONGO_PASSWORD:-secretpassword}@mongo:27017/$DB_NAME?authSource=admin" >> "$ENV_FILE"
fi

echo "Created '$ENV_FILE' with CLIENT_PORT=$PORT."

# 4. Inject service block into docker-compose.yml before the top-level 'volumes:' section
python3 - <<EOF
with open('docker-compose.yml', 'r') as f:
    content = f.read()

target = '\nvolumes:\n'
service_block = '''  $RUN:
    extends:
      service: base-proto
    profiles: ["$RUN", "all"]
    ports:
      - "$PORT:3000"
    volumes:
      - ./prototypes/$RUN:/app
    env_file:
      - ./prototypes/$RUN/.env

'''

if target not in content:
    raise SystemExit('Error: Could not locate top-level volumes: section in docker-compose.yml')

new_content = content.replace(target, '\n' + service_block + 'volumes:\n')
with open('docker-compose.yml', 'w') as f:
    f.write(new_content)
EOF

echo "Added service '$RUN' (port $PORT:3000) to docker-compose.yml."

# 5. Database provisioning (cold-start SQL + live container provisioning)
if [[ "$DB" == "postgres" || "$DB" == "both" ]]; then
  SQL_FILE="docker/postgres/init/01-create-databases.sql"
  if [[ -f "$SQL_FILE" ]] && ! grep -q "CREATE DATABASE $DB_NAME;" "$SQL_FILE"; then
    echo "CREATE DATABASE $DB_NAME;" >> "$SQL_FILE"
    echo "Appended 'CREATE DATABASE $DB_NAME;' to $SQL_FILE (for cold starts)."
  fi

  # Dynamic provisioning on running container (avoids Postgres initdb trap)
  if docker compose ps postgres --status running -q 2>/dev/null | grep -q .; then
    echo "Checking live PostgreSQL container for '$DB_NAME'..."
    EXISTS=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-lerch}" -d default_db -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null | tr -d '[:space:]' || true)
    if [[ "$EXISTS" != "1" ]]; then
      echo "Creating database '$DB_NAME' on running PostgreSQL container..."
      docker compose exec -T postgres psql -U "${POSTGRES_USER:-lerch}" -d default_db -c "CREATE DATABASE $DB_NAME;"
      echo "Database '$DB_NAME' created successfully on running PostgreSQL."
    else
      echo "Database '$DB_NAME' already exists on running PostgreSQL."
    fi
  else
    echo "Notice: PostgreSQL container is not running. Database will be created on next volume initialization from $SQL_FILE."
  fi
elif [[ "$DB" == "mongo" ]]; then
  echo "Notice: MongoDB creates collections and databases lazily on first document write."
fi

echo "==> Prototype '$RUN' successfully scaffolded!"
echo "    Start container:  make up RUN=$RUN"
echo "    Seed database:    make seed RUN=$RUN"
echo "    Browse UI:        http://localhost:$PORT"