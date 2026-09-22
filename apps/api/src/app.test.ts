import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AnalysisGraph } from "@repolens/contracts";

import { createApp, healthStatus } from "./app.js";

describe("Express API", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createApp().listen(0, "127.0.0.1");
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
  });
});
