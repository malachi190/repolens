# ADR 0001: Evidence-first analysis graph

- Status: Accepted
- Date: 2026-09-20

## Context

RepoLens must explain unfamiliar Laravel repositories without presenting model
guesses as facts. The graph will serve the UI, source viewer, request-flow
reconstruction, retrieval, and later AI explanations.

## Decision

Every extracted graph node and edge must have one or more source evidence
records. Evidence includes the repository-relative path, an inclusive line
range, extraction kind, and a confidence level.

Identifiers are deterministic and derived from semantic identity, for example
`class:App\\Models\\Order`, `method:App\\Http\\Controllers\\OrderController::store`,
and `route:POST:/orders`.

Confidence has three values:

- `certain`: directly expressed in source syntax.
- `probable`: produced by a strong framework convention.
- `possible`: heuristic or ambiguous inference.

The syntax parser and Laravel interpretation layer remain separate. Consumers
depend on the shared TypeScript graph contract, not parser-specific syntax tree
objects.

## Consequences

- Findings can always navigate back to source.
- The UI can visibly distinguish facts from inference.
- Parser implementations can be replaced without changing API contracts.
- Storage is somewhat larger because evidence is first-class data.
