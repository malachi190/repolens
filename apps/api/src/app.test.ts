import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AnalysisGraph } from "@repolens/contracts";

import type { AnalysisJob, AnalysisJobStore } from "./analysis-job-store.js";
import { createApp, healthStatus } from "./app.js";

class MemoryAnalysisJobStore implements AnalysisJobStore {
  private readonly jobs = new Map<string, AnalysisJob>();

  async save(job: AnalysisJob): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async get(id: string): Promise<AnalysisJob | undefined> {
    return this.jobs.get(id);
  }

  async failInterrupted(id: string): Promise<AnalysisJob | undefined> {
    const job = this.jobs.get(id);
    if (job && (job.status === "queued" || job.status === "running")) {
      const failed: AnalysisJob = {
        id,
        repository: job.repository,
        status: "failed",
        error: "Analysis interrupted by API restart",
      };
      this.jobs.set(id, failed);
      return failed;
    }
    return job;
  }
}

describe("Express API", () => {
  let server: Server;
  let baseUrl: string;
  const store = new MemoryAnalysisJobStore();

  beforeAll(async () => {
    server = createApp(store).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("responds to health checks over HTTP", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(healthStatus());
  });

  it("validates analysis requests and unknown jobs", async () => {
    const invalid = await fetch(`${baseUrl}/analyses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repository: "relative/path" }),
    });
    expect(invalid.status).toBe(400);
    expect((await fetch(`${baseUrl}/analyses/unknown`)).status).toBe(404);
  });

  it("analyzes the Laravel fixture through a separate worker", async () => {
    const repository = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../fixtures/laravel-orders",
    );
    const started = await fetch(`${baseUrl}/analyses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repository }),
    });
    expect(started.status).toBe(202);
    const created = await started.json() as { id: string; status: string };
    expect(started.headers.get("location")).toBe(`/analyses/${created.id}`);

    let result: { status: string; graph?: AnalysisGraph; error?: string } | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      const response = await fetch(`${baseUrl}/analyses/${created.id}`);
      result = await response.json() as typeof result;
      if (result?.status === "completed" || result?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(result?.status, result?.error).toBe("completed");
    expect(result?.graph?.schemaVersion).toBe("2.0");
    expect(result?.graph?.edges.some((edge) => edge.type === "handled_by" &&
      edge.source === "route:POST:/orders")).toBe(true);

    const restarted = createApp(store).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => restarted.once("listening", resolve));
    try {
      const address = restarted.address();
      if (!address || typeof address === "string") throw new Error("Expected a TCP server");
      const restored = await fetch(`http://127.0.0.1:${address.port}/analyses/${created.id}`);
      expect(restored.status).toBe(200);
      expect((await restored.json() as { graph: AnalysisGraph }).graph.nodes.length).toBe(22);
    } finally {
      await new Promise<void>((resolve) => restarted.close(() => resolve()));
    }
  });

  it("marks an interrupted job as failed after restart", async () => {
    const id = randomUUID();
    const repository = "/tmp/interrupted-laravel-repository";
    await store.save({ id, repository, status: "running" });
    const response = await fetch(`${baseUrl}/analyses/${id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id,
      repository,
      status: "failed",
      error: "Analysis interrupted by API restart",
    });
  });
});
