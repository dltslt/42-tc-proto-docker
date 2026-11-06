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

# 5. Boot and seed each target prototype
for run in $TARGETS; do
  proto_dir="prototypes/$run"

  if [[ ! -d "$proto_dir" ]]; then
    echo "==> Skipping $run: directory '$proto_dir' does not exist."
    continue
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

# 6. Lifecycle cleanup
if [[ "$KEEP_UP" == "1" ]] || [[ "$KEEP_UP" == "true" ]] || [[ "$KEEP_UP" == "--up" ]]; then
  echo "==> Initialization complete. Target containers are running."
else
  echo "==> Shutting down cleanly..."
  docker compose --profile "*" down
  echo "==> Initialization complete. Run 'make up RUN=<n>' to start a prototype."
fi
