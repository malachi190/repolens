import express from "express";
import type { Express } from "express";
import path from "node:path";

import type { AnalysisJobStore } from "./analysis-job-store.js";
import { AnalysisJobs } from "./analysis-jobs.js";

export function healthStatus() {
  return { status: "ok", service: "repolens-api" } as const;
}

export function createApp(store: AnalysisJobStore): Express {
  const app = express();
  const jobs = new AnalysisJobs(store);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json(healthStatus());
  });

  app.post("/analyses", async (request, response) => {
    const repository = request.body?.repository;
    if (typeof repository !== "string" || !path.isAbsolute(repository)) {
      response.status(400).json({ error: "repository must be an absolute path" });
      return;
    }
    const job = await jobs.start(repository);
    response.status(202).location(`/analyses/${job.id}`).json(job);
  });

  app.get("/analyses/:id", async (request, response) => {
    const id = request.params.id;
    const job = id ? await jobs.get(id) : undefined;
    if (!job) {
      response.status(404).json({ error: "Analysis not found" });
      return;
    }
    response.json(job);
  });

  return app;
}
