# ADR 0003: Multi-stack analysis boundaries

- Status: Accepted
- Date: 2026-09-22

## Context

Laravel is RepoLens's first supported stack, but future analyzers will cover
other technologies, including Go and TypeScript. Parser syntax and framework
conventions differ; evidence, graph navigation, and API workflows should remain
consistent across stacks.

## Decision

Keep the graph contract and its validation independent of PHP and Laravel.
Record project technologies as a list rather than framework-specific fields.
The project metadata change increments the graph schema version to `2.0`.
Each stack analyzer owns source discovery, parsing, framework interpretation,
and stack-specific tests. It emits the same evidence-backed graph contract.

API analysis jobs select analyzers through a registry based on repository
contents. The first registry entry detects Laravel from `composer.json` and
runs its analyzer in a separate process. HTTP handlers and graph consumers do
not import a specific parser or encode Laravel conventions. Extend graph node
and edge vocabulary only when a new analyzer needs it, preserving common
relationship types where they have the same meaning.

## Consequences

- Laravel remains the first implementation without defining the product's scope.
- Future Go and TypeScript analyzers can be added without replacing the API or
  graph consumers.
- The API stores job metadata and completed graphs in PostgreSQL. A durable
  distributed queue remains future work.
