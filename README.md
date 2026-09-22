# RepoLens

RepoLens is an evidence-first code intelligence platform for understanding
unfamiliar codebases. It maps code and relationships into a typed graph linked
to the source behind each finding. Laravel is the first supported stack; the
analysis architecture will support other stacks, including Go and TypeScript.

## Technology direction

RepoLens uses TypeScript across the product:

- Express for the application API
- A separate Node.js analysis worker
- Stack-specific analyzers behind a shared graph contract; Tree-sitter PHP
  powers the first Laravel analyzer
- Next.js for the web application (next phase)
- PostgreSQL, pgvector, Redis, and object storage (later phases)

The API stays separate from workers because cloning and analyzing repositories
must not block HTTP requests.

## Current milestone

The local Laravel analyzer and CLI produce an evidence-backed graph for a
Laravel repository. The local API can start an analysis in a separate process
and return its graph when the job completes.

```bash
pnpm install
make test
make analyze-fixture
```

The last command writes `output/fixture-analysis.json`.

## Local API

Build the workspace and start the API:

```bash
pnpm build
pnpm --filter @repolens/api start
```

In another terminal, send an absolute path to a Laravel repository:

```bash
curl -s -X POST http://127.0.0.1:3001/analyses \
  -H 'content-type: application/json' \
  -d "{\"repository\":\"$(pwd)/fixtures/laravel-orders\"}"
```

The API returns `202` with a job `id` and a `Location` header. Use the returned
ID to poll for the result:

```bash
curl -s http://127.0.0.1:3001/analyses/JOB_ID
```

The status moves from `queued` or `running` to `completed` with a graph, or to
`failed` with an error. Jobs are currently stored in memory and disappear when
the API restarts. The API listens on localhost for local development.

## Repository layout

```text
apps/api/             Express API and local analysis worker
packages/analyzer/    First stack adapter: Laravel analyzer and CLI
packages/contracts/   Stack-independent graph and API contracts
fixtures/             Laravel projects with known expected graphs
docs/adr/             Architecture decisions
```

## CLI

```bash
pnpm --filter @repolens/analyzer analyze /path/to/laravel-repository --pretty
```
