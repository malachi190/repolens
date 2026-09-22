import type { AnalysisGraph } from "@repolens/contracts";
import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const analysisStatus = pgEnum("analysis_status", ["queued", "running", "completed", "failed"]);

export const analysisJobs = pgTable("analysis_jobs", {
  id: uuid("id").primaryKey(),
  repository: text("repository").notNull(),
  status: analysisStatus("status").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const analysisResults = pgTable("analysis_results", {
  jobId: uuid("job_id").primaryKey().references(() => analysisJobs.id, { onDelete: "cascade" }),
  graph: jsonb("graph").$type<AnalysisGraph>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
