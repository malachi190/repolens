import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import type { AnalysisGraph } from "@repolens/contracts";

import { analyzeRepository } from "./analyzer.js";

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/laravel-orders",
);

describe("Laravel analyzer", () => {
  let graph: AnalysisGraph;

  beforeAll(async () => {
    graph = await analyzeRepository(fixture);
  });

  const hasEdge = (type: string, source: string, target: string) =>
    graph.edges.some((edge) => edge.type === type && edge.source === source && edge.target === target);

  it("detects project metadata", () => {
    expect(graph.project.name).toBe("repolens/laravel-orders-fixture");
    expect(graph.project.laravelConstraint).toBe("^12.0");
  });

  it("connects the route to its controller method", () => {
    expect(
      hasEdge(
        "handled_by",
        "route:POST:/orders",
        "method:App\\Http\\Controllers\\OrderController::store",
      ),
    ).toBe(true);
  });

  it("connects the controller to its request and model", () => {
    const method = "method:App\\Http\\Controllers\\OrderController::store";
    expect(hasEdge("accepts", method, "class:App\\Http\\Requests\\StoreOrderRequest")).toBe(true);
    expect(hasEdge("uses", method, "class:App\\Models\\Order")).toBe(true);
  });

  it("connects models and migrations to tables", () => {
    expect(hasEdge("persists_to", "class:App\\Models\\Order", "table:orders")).toBe(true);
    expect(
      hasEdge(
        "creates_table",
        "file:database/migrations/2026_09_20_000000_create_orders_table.php",
        "table:orders",
      ),
    ).toBe(true);
  });

  it("extracts Eloquent relationships", () => {
    expect(
      hasEdge("belongs_to", "class:App\\Models\\Order", "class:App\\Models\\Customer"),
    ).toBe(true);
    expect(
      hasEdge("has_many", "class:App\\Models\\Customer", "class:App\\Models\\Order"),
    ).toBe(true);
  });

  it("attaches evidence to every edge", () => {
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.edges.every((edge) => edge.evidence.length > 0)).toBe(true);
  });
});

