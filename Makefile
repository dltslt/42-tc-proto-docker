.DEFAULT_GOAL := help

.PHONY: help up up-all down logs sh db-reset

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

up: ## Start a prototype run or template (Usage: make up RUN=template or make up RUN=run-01)
	@if [ -z "$(RUN)" ]; then echo "Error: RUN is required (e.g. make up RUN=template or make up RUN=run-01)" >&2; exit 1; fi
	docker compose --profile $(RUN) up -d

up-all: ## Start all prototypes simultaneously
	docker compose --profile all up -d

down: ## Stop all running prototype containers
	docker compose --profile all down

logs: ## Tail logs for a prototype (Usage: make logs RUN=template or make logs RUN=run-01)
	@if [ -z "$(RUN)" ]; then echo "Error: RUN is required (e.g. make logs RUN=run-01)" >&2; exit 1; fi
	docker compose logs -f $(RUN)

sh: ## Open a shell inside a prototype container (Usage: make sh RUN=template or make sh RUN=run-01)
	@if [ -z "$(RUN)" ]; then echo "Error: RUN is required (e.g. make sh RUN=run-01)" >&2; exit 1; fi
	docker compose exec $(RUN) sh

db-reset: ## Wipe databases and restart shared engines with fresh volumes
	docker compose down -v
	docker compose up -d postgres mongo

