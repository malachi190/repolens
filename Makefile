.PHONY: install test typecheck build dev-api analyze-fixture

install:
	pnpm install

test:
	pnpm test

typecheck:
	pnpm typecheck

build:
	pnpm build

dev-api:
	pnpm --filter @repolens/api dev

analyze-fixture:
	mkdir -p output
	pnpm --filter @repolens/analyzer analyze ../../fixtures/laravel-orders --pretty --output ../../output/fixture-analysis.json
