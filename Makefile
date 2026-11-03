.DEFAULT_GOAL := help

.PHONY: help init new up up-all down seed logs logs-all sh db-reset

# Normalize RUN: 1 -> run-01, 42 -> run-42, run-1 -> run-01, run-01 -> run-01, template -> template
NORM_RUN = $(shell bash -c 'r="$(RUN)"; if [[ "$$r" =~ ^[0-9]+$$ ]]; then printf "run-%02d" "$$r"; elif [[ "$$r" =~ ^run-([0-9]+)$$ ]]; then printf "run-%02d" "$${BASH_REMATCH[1]}"; else echo "$$r"; fi')

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

init: ## Bootstrap stack after fresh clone (pulls images, seeds DBs, shuts down clean)
	@if [ ! -f .env ]; then cp .env.example .env && echo "Created .env from .env.example"; fi
	@echo "==> Pulling base container images..."
	@docker compose pull postgres mongo base-proto
	@echo "==> Starting database engines..."
	@docker compose up -d postgres mongo
	@for dir in prototypes/run-*/; do \
		if [ -d "$$dir" ]; then \
			run=$$(basename "$$dir"); \
			echo "==> Seeding $$run..."; \
			@docker compose run --rm -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 "$$run" sh -c "corepack enable && pnpm run db:seed"; \
		fi \
	done
	@echo "==> Shutting down cleanly..."
	@docker compose --profile all down
	@echo "==> Initialization complete. Run 'make up RUN=<n>' to start a prototype."

new: ## Scaffold a new prototype run (Usage: make new RUN=1 or make new RUN=42 [DB=postgres|mongo])
	@bash ./scripts/scaffold-run.sh "$(RUN)" "$(DB)"

up: ## Start a prototype run or template (Usage: make up RUN=1 or make up RUN=template)
	@run="$(NORM_RUN)"; \
	if [ -z "$$run" ]; then echo "Error: RUN is required (e.g. make up RUN=1 or make up RUN=template)" >&2; exit 1; fi; \
	docker compose --profile "$$run" up -d

up-all: ## Start all prototypes simultaneously
	docker compose --profile all up -d

down: ## Stop all running prototype containers
	docker compose --profile all down

seed: ## Run the seed script for a prototype (Usage: make seed RUN=1 or make seed RUN=template)
	@run="$(NORM_RUN)"; \
	if [ -z "$$run" ]; then echo "Error: RUN is required (e.g. make seed RUN=1 or make seed RUN=template)" >&2; exit 1; fi; \
	docker compose exec "$$run" pnpm run db:seed

logs: ## Tail logs for a prototype (Usage: make logs RUN=1 or make logs RUN=template)
	@run="$(NORM_RUN)"; \
	if [ -z "$$run" ]; then echo "Error: RUN is required (e.g. make logs RUN=1)" >&2; exit 1; fi; \
	docker compose logs -f "$$run"

logs-all: ## Tail logs for all running prototype containers
	docker compose --profile all logs -f

sh: ## Open a shell inside a prototype container (Usage: make sh RUN=1 or make sh RUN=template)
	@run="$(NORM_RUN)"; \
	if [ -z "$$run" ]; then echo "Error: RUN is required (e.g. make sh RUN=1)" >&2; exit 1; fi; \
	docker compose exec "$$run" sh

db-reset: ## Wipe databases and restart shared engines with fresh volumes
	docker compose down -v
	docker compose up -d postgres mongo
