# ADR 0004: PostgreSQL persistence through Drizzle

- Status: Accepted
- Date: 2026-09-22

## Context

The local analysis API needs durable jobs and graph results. RepoLens also plans
semantic retrieval over code, for which PostgreSQL can later use pgvector. A
separate local SQLite or JSON store would add a second persistence path to
maintain and eventually migrate.

## Decision

Use PostgreSQL for all application persistence and Drizzle for TypeScript schema
definitions, queries, and migrations. Store job metadata in `analysis_jobs` and
completed graph snapshots as JSONB in `analysis_results`. Keep the job store
interface so the HTTP and worker layers do not depend on database details.

Run schema migrations before starting the API. Add pgvector only when embeddings
and similarity queries are implemented; the current graph analyzer does not
require the extension.

## Consequences

- Completed analyses remain available after an API restart.
- Local development requires a PostgreSQL instance and a configured
  `DATABASE_URL`.
- Graph snapshots can be retrieved now; indexed graph queries and a durable
  distributed job queue require later schema and workflow changes.
