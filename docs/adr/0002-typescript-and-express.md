# ADR 0002: TypeScript services with Express

- Status: Accepted
- Date: 2026-09-20

## Context

RepoLens needs a web interface, an HTTP API, background workers, and a Laravel
static analyzer. Maintaining Python alongside TypeScript would increase the
learning and operational burden during the initial product phase.

## Decision

Use TypeScript across the V1 application. Use Express for the HTTP API and keep
repository analysis in a separate worker process. Share runtime-validated graph
and API contracts through a workspace package.

Tree-sitter remains the PHP parsing engine. PostgreSQL, Redis, and object storage
remain unchanged from the product architecture.

## Consequences

- The frontend, API, workers, analyzer, and contracts use one language.
- Express keeps the HTTP layer small and familiar.
- Long-running analysis does not execute inside API request handlers.
- A performance-sensitive analyzer can still become a Go service later without
  changing the graph contract.
