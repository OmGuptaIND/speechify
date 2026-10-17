.PHONY: setup backend start stop status extension package preview check macos macos-check app installer

setup:
	uv sync --project backend --locked
	uv run --project backend --locked speechify-download
	npm ci --prefix extension
	npm run build --prefix extension

backend:
	uv run --project backend --locked speechify-backend

start:
	uv run --project backend --locked speechify-control start --copy-key

stop:
	uv run --project backend --locked speechify-control stop

status:
	uv run --project backend --locked speechify-control status

extension:
	npm run build --prefix extension

package: extension
	uv run --project backend --locked python scripts/package.py

preview:
	npm run preview --prefix extension

check:
	uv run --project backend --locked ruff check backend
	uv run --project backend --locked ruff format --check backend
	uv run --project backend --locked pytest backend/tests
	npm run check --prefix extension
	@if [ "$$(uname -s)" = "Darwin" ]; then $(MAKE) macos-check; fi

macos:
	./scripts/build-macos.command

app:
	./scripts/start-app.command

macos-check:
	swift test --package-path macos --scratch-path .data/swift-build

installer: macos
	./scripts/package-macos.command
