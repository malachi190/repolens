import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { analysisGraphSchema } from "@repolens/contracts";

import type { AnalysisJob, AnalysisJobStore } from "./analysis-job-store.js";
import { analysisJobs, analysisResults } from "./db/schema.js";

const jobIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PostgresAnalysisJobStore implements AnalysisJobStore {
  private readonly pool: Pool;
  private readonly db: ReturnType<typeof drizzle>;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.db = drizzle(this.pool);
  }

  async assertReady(): Promise<void> {
    await this.db.select({ id: analysisJobs.id }).from(analysisJobs).limit(1);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async save(job: AnalysisJob): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(analysisJobs).values({
        id: job.id,
        repository: job.repository,
        status: job.status,
        error: job.status === "failed" ? job.error : null,
      }).onConflictDoUpdate({
        target: analysisJobs.id,
        set: {
          status: job.status,
          error: job.status === "failed" ? job.error : null,
          updatedAt: new Date(),
        },
      });

      if (job.status === "completed") {
        await tx.insert(analysisResults).values({ jobId: job.id, graph: job.graph })
          .onConflictDoUpdate({ target: analysisResults.jobId, set: { graph: job.graph } });
      }
    });
  }

  async get(id: string): Promise<AnalysisJob | undefined> {
    if (!jobIdPattern.test(id)) return undefined;
    const [row] = await this.db.select().from(analysisJobs).where(eq(analysisJobs.id, id)).limit(1);
    if (!row) return undefined;
    const base = { id: row.id, repository: row.repository };
    if (row.status === "failed") return { ...base, status: "failed", error: row.error ?? "Analysis failed" };
    if (row.status === "queued" || row.status === "running") return { ...base, status: row.status };

    const [result] = await this.db.select({ graph: analysisResults.graph }).from(analysisResults)
      .where(eq(analysisResults.jobId, id)).limit(1);
    if (!result) throw new Error(`Analysis ${id} is complete but has no stored graph`);
    return { ...base, status: "completed", graph: analysisGraphSchema.parse(result.graph) };
  }

  async failInterrupted(id: string): Promise<AnalysisJob | undefined> {
    if (!jobIdPattern.test(id)) return undefined;
    await this.db.update(analysisJobs).set({
      status: "failed",
      error: "Analysis interrupted by API restart",
      updatedAt: new Date(),
    }).where(and(eq(analysisJobs.id, id), inArray(analysisJobs.status, ["queued", "running"])));
    return this.get(id);
  }
}
