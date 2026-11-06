#!/usr/bin/env bash
# ==============================================================================
# scripts/init.sh
#
# Control-plane script: runs on the host shell to bootstrap Docker dependencies
# and seed prototype runs. Supports cold full stack initialization, single runs,
# ranges (e.g. 500..505), or explicit lists (e.g. 500,501,502).
#
# Usage:
#   ./scripts/init.sh [RUN | RANGE | LIST] [UP]
#
# Examples:
#   ./scripts/init.sh                   # Bootstrap all existing runs and shut down clean
#   ./scripts/init.sh 100               # Bootstrap and seed run-100, then shut down clean
#   ./scripts/init.sh 500..505          # Bootstrap and seed runs 500 to 505, then shut down clean
#   ./scripts/init.sh 500,501,502       # Bootstrap and seed specific runs, then shut down clean
#   ./scripts/init.sh 500..505 1        # Bootstrap, seed, and leave containers running
# ==============================================================================
set -euo pipefail

TARGET_ARG="${1:-}"
KEEP_UP="${2:-0}"

# Normalize input into a space-separated list of service names
parse_targets() {
  local input="${1//,/ }"
  local targets=""

  if [[ -z "$input" ]]; then
    # Default: scan prototypes/run-*/ (excludes template)
    for dir in prototypes/run-*/; do
      if [[ -d "$dir" ]]; then
        targets="$targets $(basename "$dir")"
      fi
    done
  elif [[ "$input" =~ ^([0-9]+)\.\.([0-9]+)$ ]]; then
    local start="${BASH_REMATCH[1]}"
    local end="${BASH_REMATCH[2]}"
    for ((i = start; i <= end; i++)); do
      targets="$targets $(printf "run-%03d" "$i")"
    done
  else
    for item in $input; do
      if [[ "$item" =~ ^[0-9]+$ ]]; then
        targets="$targets $(printf "run-%03d" "$item")"
      elif [[ "$item" =~ ^run-([0-9]+)$ ]]; then
        targets="$targets $(printf "run-%03d" "${BASH_REMATCH[1]}")"
      elif [[ "$item" == "template" ]]; then
        targets="$targets template"
      else
        echo "Warning: Unrecognized target '$item', ignoring." >&2
      fi
    done
  fi

  echo "$targets"
}

# 1. Ensure .env exists on the host
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    echo "==> Created .env from .env.example"
  else
    echo "Error: Neither .env nor .env.example found." >&2
    exit 1
  fi
fi

# Load DB environment variables if present
set -a
# shellcheck disable=SC1091
source .env 2>/dev/null || true
set +a

TARGETS=$(parse_targets "$TARGET_ARG")
# shellcheck disable=SC2086
TARGETS=$(echo $TARGETS | xargs -n1 2>/dev/null | sort -u | xargs)

# Guard: warn if template was requested
if [[ " $TARGETS " =~ [[:space:]]template[[:space:]] ]]; then
  echo "======================================================================" >&2
  echo "WARNING: 'template' is the baseline app and is not meant to be run" >&2
  echo "or initialized directly as a prototype (see AGENTS.md §1)." >&2
  echo "======================================================================" >&2

  proceed="n"
  if [[ -e /dev/tty && -r /dev/tty ]]; then
    read -r -p "Do you want to continue anyway? [y/N]: " confirm < /dev/tty || confirm="n"
    if [[ "$confirm" =~ ^[yY]([eE][sS])?$ ]]; then
      proceed="y"
    fi
  elif [[ -t 0 ]]; then
    read -r -p "Do you want to continue anyway? [y/N]: " confirm || confirm="n"
    if [[ "$confirm" =~ ^[yY]([eE][sS])?$ ]]; then
      proceed="y"
    fi
  else
    echo "Notice: Non-interactive environment. Skipping 'template'." >&2
  fi

  if [[ "$proceed" != "y" ]]; then
    echo "==> Excluding 'template' from initialization."
    TARGETS=$(echo "$TARGETS" | tr ' ' '\n' | grep -v '^template$' | xargs || true)
  fi
fi

if [[ -z "$TARGETS" ]]; then
  echo "==> Notice: No prototype runs found or specified. Nothing to seed."
  exit 0
fi

echo "==> Target prototypes: $TARGETS"

# 2. Pull base images only on full stack bootstrap (when no target is specified)
if [[ -z "$TARGET_ARG" ]]; then
  echo "==> Pulling base container images..."
  docker compose pull postgres mongo base-proto || true
fi

# 3. Start shared database engines in background
echo "==> Starting shared database engines..."
docker compose up -d postgres mongo

# 4. Wait for PostgreSQL engine readiness
echo "==> Waiting for PostgreSQL to accept connections..."
retries=30
until docker compose exec -T postgres pg_isready -U "${DB_USER:-postgres}" -q 2>/dev/null || [[ $retries -le 0 ]]; do
  sleep 1
  retries=$((retries - 1))
done

if [[ $retries -le 0 ]]; then
  echo "Error: PostgreSQL did not become ready in time." >&2
  exit 1
fi
echo "==> PostgreSQL is ready."

# 5. Determine existing virtual stores on pnpm_store volume
COMPOSE_PROJECT=$(docker compose config --format json 2>/dev/null | jq -r .name 2>/dev/null || echo "tc-proto-docker")
PNPM_VOLUME="${COMPOSE_PROJECT}_pnpm_store"

EXISTING_STORES=""
if docker volume inspect "$PNPM_VOLUME" >/dev/null 2>&1; then
  EXISTING_STORES=$(docker run --rm -v "$PNPM_VOLUME:/p" node:22-slim sh -c 'ls -d /p/*/pnpm 2>/dev/null | sed -e "s#/p/##" -e "s#/pnpm##"' 2>/dev/null || true)
fi

# 6. Boot and seed each target prototype
for run in $TARGETS; do
  proto_dir="prototypes/$run"
  if [[ "$run" == "template" ]]; then
    proto_dir="prototypes/template"
  fi

  if [[ ! -d "$proto_dir" ]]; then
    echo "==> Skipping $run: directory '$proto_dir' does not exist."
    continue
  fi

  # Guard 1: Skip incomplete or empty runs (missing package.json or nuxt.config.ts)
  if [[ ! -f "$proto_dir/package.json" || ! -f "$proto_dir/nuxt.config.ts" ]]; then
    echo "==> Skipping $run: incomplete prototype (missing package.json or nuxt.config.ts)."
    continue
  fi

  # Guard 2: Skip if already initialized (virtual store present and DB seeded)
  store_exists=0
  if echo " $EXISTING_STORES " | grep -qw "$run"; then
    store_exists=1
  fi

  local_db_name="proto_${run//-/_}"
  needs_db=0
  db_seeded=0
  table_count=0

  if grep -qE '"(pg|postgres|kysely|drizzle-orm)"' "$proto_dir/package.json" 2>/dev/null; then
    needs_db=1
    # Query PostgreSQL for table count in public schema
    table_count=$(docker compose exec -T postgres psql -U "${DB_USER:-lerch}" -d "$local_db_name" -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null || echo "0")
    if [[ "$table_count" =~ ^[0-9]+$ ]] && [[ "$table_count" -gt 0 ]]; then
      db_seeded=1
    fi
  elif grep -qE '"mongodb"' "$proto_dir/package.json" 2>/dev/null; then
    needs_db=1
    col_count=$(docker compose exec -T mongo mongosh -u "${DB_USER:-lerch}" -p "${DB_PASSWORD:-lerch}" --authenticationDatabase admin --quiet --eval "db.getSiblingDB('$local_db_name').getCollectionNames().length" 2>/dev/null || echo "0")
    if [[ "$col_count" =~ ^[0-9]+$ ]] && [[ "$col_count" -gt 0 ]]; then
      db_seeded=1
    fi
  fi

  if [[ "$store_exists" -eq 1 ]]; then
    if [[ "$run" == "template" ]]; then
      echo "==> template: already initialized (virtual store present). Skipping."
      continue
    elif [[ "$needs_db" -eq 1 && "$db_seeded" -eq 1 ]]; then
      echo "==> $run: already initialized (virtual store present, DB seeded with $table_count tables). Skipping."
      continue
    elif [[ "$needs_db" -eq 0 ]]; then
      echo "==> $run: already initialized (virtual store present, in-memory DB). Skipping."
      continue
    fi
  fi

  echo "==> Booting $run container..."
  docker compose --profile "$run" up -d "$run"

  # Wait for package installation to complete (Vite/Nuxt binaries linked)
  echo "==> Waiting for package links in $run..."
  pkg_retries=30
  while [[ $pkg_retries -gt 0 ]]; do
    if docker compose exec -T "$run" test -f /app/node_modules/.bin/nuxt 2>/dev/null || \
       docker compose exec -T "$run" test -f /app/node_modules/.bin/tsx 2>/dev/null; then
      break
    fi
    sleep 1
    pkg_retries=$((pkg_retries - 1))
  done

  echo "==> Seeding database for $run..."
  docker compose exec -T "$run" pnpm run db:seed
done

# 7. Lifecycle cleanup
if [[ "$KEEP_UP" == "1" ]] || [[ "$KEEP_UP" == "true" ]] || [[ "$KEEP_UP" == "--up" ]]; then
  echo "==> Initialization complete. Target containers are running."
else
  echo "==> Shutting down cleanly..."
  docker compose --profile "*" down
  echo "==> Initialization complete. Run 'make up RUN=<n>' to start a prototype."
fi
