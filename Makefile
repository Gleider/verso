# Entrada única de comandos do Verso.
# (O plano previa `just`; o Makefile faz o mesmo sem dependência extra.)

SHELL := /bin/bash
VENV  := .venv/bin
WEB   := apps/web

# O .env fica na raiz, mas o compose procuraria o dele em infra/.
# Sem --env-file, variáveis como REDIS_HOST_PORT nunca chegam ao compose.
COMPOSE := docker compose -f infra/docker-compose.yml --env-file .env

.PHONY: help setup env ml check-ml up down logs api worker web migrate revision test lint typecheck openapi clean

help:  ## Lista os comandos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

setup: env  ## Instala dependências de Python e do frontend (sem os modelos de ML)
	uv sync
	cd $(WEB) && npm install --no-audit --no-fund
	@echo
	@echo "Para transcrever, o worker precisa dos extras de ML: make ml"

ml:  ## Instala torch, demucs e faster-whisper (~2 GB) — necessário para o worker
	uv sync --extra ml

check-ml:  ## Confere se o worker tem o que precisa para rodar o pipeline
	@$(VENV)/python -c "import demucs, faster_whisper" 2>/dev/null || { \
		echo ""; \
		echo "  O worker precisa de demucs e faster-whisper, e eles não estão instalados."; \
		echo "  Rode:  make ml"; \
		echo ""; \
		echo "  Atenção: 'uv sync' sem --extra ml REMOVE esses pacotes."; \
		echo "  Sempre que mexer nas dependências, rode 'make ml' de novo."; \
		echo ""; \
		exit 1; \
	}
	@echo "  ✓ demucs e faster-whisper presentes."

env:  ## Cria o .env a partir do exemplo, se ainda não existir
	@test -f .env || { cp .env.example .env; echo "criado .env a partir de .env.example"; }

up: env  ## Sobe Postgres e Redis
	$(COMPOSE) up -d postgres redis
	@echo "Aguardando o banco ficar pronto…"
	@until $(COMPOSE) exec -T postgres pg_isready -U verso >/dev/null 2>&1; do sleep 1; done
	$(MAKE) migrate

down: env  ## Derruba os contêineres
	$(COMPOSE) down

logs: env  ## Acompanha os logs dos contêineres
	$(COMPOSE) logs -f

api:  ## Roda a API em modo recarregável
	$(VENV)/uvicorn verso_api.main:app --reload --port 8000

worker: check-ml  ## Roda o worker (falha cedo se faltarem os extras de ML)
	$(VENV)/arq verso_worker.main.WorkerSettings

web:  ## Roda o frontend
	cd $(WEB) && npm run dev

migrate:  ## Aplica as migrations
	cd apps/api && ../../$(VENV)/alembic upgrade head

revision:  ## Gera uma migration nova: make revision m="descrição"
	cd apps/api && ../../$(VENV)/alembic revision --autogenerate -m "$(m)"

test:  ## Roda a suíte de testes (backend e frontend)
	$(VENV)/python -m pytest -q
	cd $(WEB) && npm test --silent

lint:  ## Confere o estilo do Python
	$(VENV)/ruff check .

typecheck:  ## Confere os tipos do frontend
	cd $(WEB) && npm run typecheck

openapi:  ## Regenera os tipos TS a partir do OpenAPI (a API precisa estar de pé)
	cd $(WEB) && npm run gen:api

clean:  ## Remove caches
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	rm -rf .pytest_cache .ruff_cache
