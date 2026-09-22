import express from "express";
import type { Express } from "express";

export function healthStatus() {
  return { status: "ok", service: "repolens-api" } as const;
}

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json(healthStatus());
  });

  return app;
}
