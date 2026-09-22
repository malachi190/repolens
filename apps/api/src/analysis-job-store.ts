import type { AnalysisGraph } from "@repolens/contracts";

export type AnalysisJob =
  | { id: string; repository: string; status: "queued" | "running" }
  | { id: string; repository: string; status: "completed"; graph: AnalysisGraph }
  | { id: string; repository: string; status: "failed"; error: string };

export interface AnalysisJobStore {
  save(job: AnalysisJob): Promise<void>;
  get(id: string): Promise<AnalysisJob | undefined>;
  failInterrupted(id: string): Promise<AnalysisJob | undefined>;
}
