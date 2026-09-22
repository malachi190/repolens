# RepoLens

RepoLens is an evidence-first code intelligence platform. Its first milestone is
a local Laravel analyzer that turns routes, PHP symbols, models, migrations, and
their relationships into a typed graph with file and line evidence.

## Technology direction

RepoLens uses TypeScript across the product:

- Express for the application API
- A separate Node.js analysis worker
- Tree-sitter PHP for syntax extraction
- Next.js for the web application (next phase)
- PostgreSQL, pgvector, Redis, and object storage (later phases)

The API stays separate from workers because cloning and analyzing repositories
must not block HTTP requests.

## Current milestone

The local analyzer and CLI produce an evidence-backed graph for a Laravel
repository.

```bash
pnpm install
make test
make analyze-fixture
```

The last command writes `output/fixture-analysis.json`.

## Repository layout

```text
apps/api/             Express API
packages/analyzer/    Laravel analyzer and CLI
packages/contracts/   Shared graph and API contracts
fixtures/             Laravel projects with known expected graphs
docs/adr/             Architecture decisions
```

## CLI

```bash
pnpm --filter @repolens/analyzer analyze /path/to/laravel-repository --pretty
```
