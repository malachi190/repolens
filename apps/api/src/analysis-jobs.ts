import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { analysisGraphSchema } from "@repolens/contracts";

import type { AnalysisJob, AnalysisJobStore } from "./analysis-job-store.js";

export class AnalysisJobs {
  private readonly active = new Set<string>();

  constructor(private readonly store: AnalysisJobStore) {}

  async start(repository: string): Promise<AnalysisJob> {
    const job: AnalysisJob = { id: randomUUID(), repository, status: "queued" };
    this.active.add(job.id);
    try {
      await this.store.save(job);
    } catch (error) {
      this.active.delete(job.id);
      throw error;
    }
    setImmediate(() => {
      void this.run(job.id, repository).catch((error: unknown) => {
        console.error(`Analysis ${job.id} failed to update its status:`, error);
      });
    });
    return job;
  }

  async get(id: string): Promise<AnalysisJob | undefined> {
    const job = await this.store.get(id);
    if (job && (job.status === "queued" || job.status === "running") && !this.active.has(id)) {
      return this.store.failInterrupted(id);
    }
    return job;
  }

  private async finish(job: AnalysisJob): Promise<void> {
    try {
      await this.store.save(job);
    } finally {
      this.active.delete(job.id);
    }
  }

  private async run(id: string, repository: string): Promise<void> {
    try {
      await this.store.save({ id, repository, status: "running" });
      const isTypeScript = import.meta.url.endsWith(".ts");
      const workerFile = fileURLToPath(new URL(`./analysis-worker.${isTypeScript ? "ts" : "js"}`, import.meta.url));
      const worker = fork(workerFile, [], {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        execArgv: isTypeScript ? ["--import", "tsx"] : [],
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      });

      let settled = false;
      const settle = (job: AnalysisJob) => {
        if (settled) return;
        settled = true;
        void this.finish(job).catch((error: unknown) => {
          console.error(`Failed to save analysis ${id}:`, error);
        });
      };
      worker.once("message", (message: unknown) => {
        if (typeof message === "object" && message !== null && "type" in message) {
          if (message.type === "completed" && "graph" in message) {
            const parsed = analysisGraphSchema.safeParse(message.graph);
            if (parsed.success) {
              settle({ id, repository, status: "completed", graph: parsed.data });
              return;
            }
          }
          if (message.type === "failed" && "error" in message && typeof message.error === "string") {
            settle({ id, repository, status: "failed", error: message.error });
            return;
          }
        }
        settle({ id, repository, status: "failed", error: "Worker returned an invalid result" });
      });
      worker.once("error", (error) => settle({ id, repository, status: "failed", error: error.message }));
      worker.once("exit", (code) => {
        settle({ id, repository, status: "failed", error: `Worker exited with code ${code}` });
      });
      worker.send({ repository });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.finish({ id, repository, status: "failed", error: detail });
    }
  }
}
