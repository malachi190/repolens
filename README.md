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
- PostgreSQL with Drizzle for persistence
- pgvector, Redis, and object storage (later phases)

The API stays separate from workers because cloning and analyzing repositories
must not block HTTP requests.

## Current milestone

The local Laravel analyzer and CLI produce an evidence-backed graph for a
Laravel repository. The API starts analysis in a separate process and stores
job metadata and completed graphs in PostgreSQL.

```bash
pnpm install
make test
make analyze-fixture
```

The last command writes `output/fixture-analysis.json`.

## Local API and database

Start PostgreSQL with Docker Compose, or use an existing PostgreSQL database.
On a fresh checkout, copy the example environment file and set `DATABASE_URL`
there to your database connection string. The API and migration command load
`apps/api/.env` automatically:

```bash
cp apps/api/.env.example apps/api/.env
docker compose up -d db
pnpm --filter @repolens/api db:migrate
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
`failed` with an error. PostgreSQL stores job metadata in `analysis_jobs` and
completed graph JSON in `analysis_results`. Results remain available after an
API restart. An analysis interrupted by a restart is marked `failed` when
requested. The API listens on localhost for local development.

The regular test suite uses an in-memory store for its HTTP tests. To test the
PostgreSQL store against a dedicated database, create and migrate that database
once, then run:

```bash
docker compose exec db createdb -U repolens repolens_test
DATABASE_URL=postgresql://repolens:repolens@127.0.0.1:5433/repolens_test pnpm --filter @repolens/api db:migrate
TEST_DATABASE_URL=postgresql://repolens:repolens@127.0.0.1:5433/repolens_test pnpm --filter @repolens/api test:db
```

The test creates and deletes its own job rows. The checked-in migration lives
in `apps/api/drizzle/`.

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
