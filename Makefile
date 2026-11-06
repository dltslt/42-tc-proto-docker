.DEFAULT_GOAL := help

.PHONY: help init new up up-all down clean clean-all ps seed logs logs-all sh db-reset

# Target parser: normalizes RUN (single 100, range 500..505, comma/space list, or template)
TARGET_RUNS = $(shell bash -c ' \
  input="$(RUN)"; input="$${input//,/ }"; \
  if [[ "$$input" =~ ^([0-9]+)\.\.([0-9]+)$$ ]]; then \
    for ((i = $${BASH_REMATCH[1]}; i <= $${BASH_REMATCH[2]}; i++)); do printf "run-%03d " "$$i"; done; \
  elif [[ -n "$$input" ]]; then \
    for item in $$input; do \
      if [[ "$$item" =~ ^[0-9]+$$ ]]; then printf "run-%03d " "$$item"; \
      elif [[ "$$item" =~ ^run-([0-9]+)$$ ]]; then printf "run-%03d " "$${BASH_REMATCH[1]}"; \
      elif [[ "$$item" == "template" ]]; then printf "template "; \
      else printf "%s " "$$item"; fi; \
    done; \
  fi')

# Single normalized run helper (for commands requiring exactly one target: logs, sh, new)
FIRST_RUN = $(firstword $(TARGET_RUNS))

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

init: ## Bootstrap stack or seed prototype runs (Usage: make init [RUN=100 | RUN=500..505] [UP=1])
	@bash ./scripts/init.sh "$(RUN)" "$(UP)"

new: ## Scaffold a new prototype run (Usage: make new RUN=100 [DB=hybrid|postgres|mongo])
	@bash ./scripts/scaffold-run.sh "$(RUN)" "$(DB)"

up: ## Start a prototype run, range, or template (Usage: make up RUN=100 or make up RUN=500..505)
	@runs="$(TARGET_RUNS)"; \
	if [ -z "$$runs" ]; then echo "Error: RUN is required (e.g. make up RUN=100 or make up RUN=500..505)" >&2; exit 1; fi; \
	for r in $$runs; do \
		docker compose --profile "$$r" up -d "$$r"; \
	done

up-all: ## Start all prototypes simultaneously
	docker compose --profile all up -d

down: ## Stop running prototype containers (Usage: make down [RUN=100 | RUN=500..505])
	@runs="$(TARGET_RUNS)"; \
	if [ -n "$$runs" ]; then \
		for r in $$runs; do docker compose stop "$$r"; done; \
	else \
		docker compose --profile "*" down; \
	fi

clean: ## Remove container and anonymous volumes for a prototype (Usage: make clean RUN=100 or make clean RUN=500..505)
	@runs="$(TARGET_RUNS)"; \
	if [ -z "$$runs" ]; then echo "Error: RUN is required (e.g. make clean RUN=100 or make clean RUN=template, or use make clean-all)" >&2; exit 1; fi; \
	for r in $$runs; do \
		docker compose --profile "$$r" rm -s -f -v "$$r"; \
	done

clean-all: ## Stop and remove all containers and volumes across the stack
	docker compose --profile "*" down -v --remove-orphans

ps: ## List running containers in the compose stack (Usage: make ps or make ps RUN=100)
	@runs="$(TARGET_RUNS)"; \
	if [ -n "$$runs" ]; then \
		docker compose ps $$runs; \
	else \
		docker compose --profile "*" ps; \
	fi

seed: ## Run the seed script for a prototype or range (Usage: make seed RUN=100 or make seed RUN=500..505)
	@runs="$(TARGET_RUNS)"; \
	if [ -z "$$runs" ]; then echo "Error: RUN is required (e.g. make seed RUN=100 or make seed RUN=template)" >&2; exit 1; fi; \
	for r in $$runs; do \
		echo "==> Seeding $$r..."; \
		docker compose exec "$$r" pnpm run db:seed; \
	done

logs: ## Tail logs for a prototype (Usage: make logs RUN=100 or make logs RUN=template)
	@run="$(FIRST_RUN)"; \
	if [ -z "$$run" ]; then echo "Error: RUN is required (e.g. make logs RUN=100)" >&2; exit 1; fi; \
	docker compose logs -f "$$run"

logs-all: ## Tail logs for all running prototype containers
	docker compose --profile "*" logs -f

sh: ## Open a shell inside a prototype container (Usage: make sh RUN=100 or make sh RUN=template)
	@run="$(FIRST_RUN)"; \
	if [ -z "$$run" ]; then echo "Error: RUN is required (e.g. make sh RUN=100)" >&2; exit 1; fi; \
	docker compose exec "$$run" sh

db-reset: ## Wipe databases and restart shared engines with fresh volumes
	@echo "==> Stopping and removing database containers..."
	@docker compose stop postgres mongo
	@docker compose rm -f -v postgres mongo
	@echo "==> Removing database volumes only..."
	@proj=$$(docker compose config --format json 2>/dev/null | jq -r .name 2>/dev/null || echo "tc-proto-docker"); \
	docker volume rm -f "$${proj}_postgres_data" "$${proj}_mongo_data" 2>/dev/null || true
	@echo "==> Restarting database containers with clean volumes..."
	@docker compose up -d postgres mongo
