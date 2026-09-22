import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeRepository } from "@repolens/analyzer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { PostgresAnalysisJobStore } from "./postgres-analysis-job-store.js";

const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(!connectionString)("PostgreSQL analysis job store", () => {
  let store: PostgresAnalysisJobStore;
  const ids: string[] = [];

  beforeAll(async () => {
    store = new PostgresAnalysisJobStore(connectionString!);
    await store.assertReady();
  });

  afterAll(async () => {
    const pool = new Pool({ connectionString });
    try {
      if (ids.length) await pool.query("DELETE FROM analysis_jobs WHERE id = ANY($1::uuid[])", [ids]);
    } finally {
      await pool.end();
      await store.close();
    }
  });

  it("persists job metadata and a graph across store instances", async () => {
    const id = randomUUID();
    ids.push(id);
    const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../fixtures/laravel-orders");
    await store.save({ id, repository, status: "queued" });
    expect(await store.get(id)).toEqual({ id, repository, status: "queued" });

    await store.save({ id, repository, status: "running" });
    const graph = await analyzeRepository(repository);
    await store.save({ id, repository, status: "completed", graph });

    const reopened = new PostgresAnalysisJobStore(connectionString!);
    try {
      const restored = await reopened.get(id);
      expect(restored?.status).toBe("completed");
      if (restored?.status === "completed") {
        expect(restored.graph.nodes.length).toBe(22);
        expect(restored.graph.schemaVersion).toBe("2.0");
      }
      expect((await reopened.failInterrupted(id))?.status).toBe("completed");
    } finally {
      await reopened.close();
    }
  });

  it("fails an interrupted job without accepting an invalid ID", async () => {
    const id = randomUUID();
    ids.push(id);
    const repository = "/tmp/interrupted-laravel-repository";
    await store.save({ id, repository, status: "running" });
    expect(await store.failInterrupted(id)).toEqual({
      id,
      repository,
      status: "failed",
      error: "Analysis interrupted by API restart",
    });
    expect(await store.get("unknown")).toBeUndefined();
  });
});
