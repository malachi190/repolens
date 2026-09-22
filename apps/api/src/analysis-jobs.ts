import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { analysisGraphSchema, type AnalysisGraph } from "@repolens/contracts";

export type AnalysisJob =
  | { id: string; status: "queued" | "running" }
  | { id: string; status: "completed"; graph: AnalysisGraph }
  | { id: string; status: "failed"; error: string };

export class AnalysisJobs {
  private readonly jobs = new Map<string, AnalysisJob>();

  start(repository: string): AnalysisJob {
    const job: AnalysisJob = { id: randomUUID(), status: "queued" };
    this.jobs.set(job.id, job);
    setImmediate(() => this.run(job.id, repository));
    return job;
  }

  get(id: string): AnalysisJob | undefined {
    return this.jobs.get(id);
  }

  private run(id: string, repository: string): void {
    const isTypeScript = import.meta.url.endsWith(".ts");
    const workerFile = fileURLToPath(new URL(`./analysis-worker.${isTypeScript ? "ts" : "js"}`, import.meta.url));
    const worker = fork(workerFile, [], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      execArgv: isTypeScript ? ["--import", "tsx"] : [],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    this.jobs.set(id, { id, status: "running" });

    let settled = false;
    worker.once("message", (message: unknown) => {
      settled = true;
      if (typeof message === "object" && message !== null && "type" in message) {
        if (message.type === "completed" && "graph" in message) {
          const parsed = analysisGraphSchema.safeParse(message.graph);
          if (parsed.success) {
            this.jobs.set(id, { id, status: "completed", graph: parsed.data });
            return;
          }
        }
        if (message.type === "failed" && "error" in message && typeof message.error === "string") {
          this.jobs.set(id, { id, status: "failed", error: message.error });
          return;
        }
      }
      this.jobs.set(id, { id, status: "failed", error: "Worker returned an invalid result" });
    });
    worker.once("error", (error) => {
      settled = true;
      this.jobs.set(id, { id, status: "failed", error: error.message });
    });
    worker.once("exit", (code) => {
      if (!settled) {
        this.jobs.set(id, { id, status: "failed", error: `Worker exited with code ${code}` });
      }
    });
    worker.send({ repository });
  }
}
