import { z } from "zod";

export const confidenceSchema = z.enum(["certain", "probable", "possible"]);
export type Confidence = z.infer<typeof confidenceSchema>;

export const nodeTypeSchema = z.enum([
  "project",
  "file",
  "class",
  "method",
  "route",
  "controller",
  "form_request",
  "model",
  "migration",
  "table",
]);
export type NodeType = z.infer<typeof nodeTypeSchema>;

export const edgeTypeSchema = z.enum([
  "contains",
  "declares",
  "extends",
  "handled_by",
  "accepts",
  "uses",
  "creates_table",
  "persists_to",
  "belongs_to",
  "has_one",
  "has_many",
]);
export type EdgeType = z.infer<typeof edgeTypeSchema>;

export const evidenceSchema = z.object({
  path: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  kind: z.string(),
  confidence: confidenceSchema,
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const graphNodeSchema = z.object({
  id: z.string(),
  type: nodeTypeSchema,
  name: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  evidence: z.array(evidenceSchema).min(1),
});
export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphEdgeSchema = z.object({
  id: z.string(),
  type: edgeTypeSchema,
  source: z.string(),
  target: z.string(),
  confidence: confidenceSchema,
  attributes: z.record(z.string(), z.unknown()),
  evidence: z.array(evidenceSchema).min(1),
});
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const projectMetadataSchema = z.object({
  name: z.string(),
  root: z.string(),
  technologies: z.array(z.object({
    name: z.string(),
    versionConstraint: z.string().optional(),
  })),
});
export type ProjectMetadata = z.infer<typeof projectMetadataSchema>;

export const analysisGraphSchema = z.object({
  schemaVersion: z.literal("2.0"),
  project: projectMetadataSchema,
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  warnings: z.array(z.string()),
});
export type AnalysisGraph = z.infer<typeof analysisGraphSchema>;
