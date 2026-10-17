.PHONY: setup backend extension preview check

setup:
	uv sync --project backend --locked
	uv run --project backend --locked speechify-download
	npm ci --prefix extension
	npm run build --prefix extension

backend:
	uv run --project backend --locked speechify-backend

extension:
	npm run build --prefix extension

preview:
	npm run preview --prefix extension

check:
	uv run --project backend --locked ruff check backend
	uv run --project backend --locked ruff format --check backend
	uv run --project backend --locked pytest backend/tests
	npm run check --prefix extension
