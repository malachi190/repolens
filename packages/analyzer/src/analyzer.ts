import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  analysisGraphSchema,
  type AnalysisGraph,
  type Confidence,
  type EdgeType,
  type Evidence,
  type GraphEdge,
  type GraphNode,
  type NodeType,
  type ProjectMetadata,
} from "@repolens/contracts";

import { parsePhpFile, resolvePhpName, type PhpClass } from "./php-parser.js";
import { lineAt, scanPhpFiles, type SourceFile } from "./source.js";

const routePattern =
  /Route::(?<verb>get|post|put|patch|delete|options|any|match)\s*\(\s*(?<quote>['"])(?<uri>.*?)\k<quote>\s*,\s*\[\s*(?<controller>[\\\w]+)::class\s*,\s*['"](?<method>\w+)['"]\s*\]/gs;
const schemaCreatePattern = /Schema::create\s*\(\s*['"](?<table>[^'"]+)['"]/g;
const relationPattern =
  /\$this->(?<relation>belongsTo|hasOne|hasMany)\s*\(\s*(?<model>[\\\w]+)::class/g;
const staticModelCallPattern =
  /(?<![\\\w])(?<model>[A-Z][A-Za-z0-9_]*)::(?:create|query|find|findOrFail|where|updateOrCreate)\s*\(/g;

function evidence(
  source: SourceFile,
  offset: number,
  kind: string,
  confidence: Confidence = "certain",
): Evidence {
  const line = lineAt(source, offset);
  return { path: source.path, startLine: line, endLine: line, kind, confidence };
}

function edgeId(type: EdgeType, source: string, target: string): string {
  return `${type}:${source}->${target}`;
}

function snakePlural(name: string): string {
  const snake = name.replace(/(?<!^)(?=[A-Z])/g, "_").toLowerCase();
  if (/[^aeiou]y$/.test(snake)) return `${snake.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(snake)) return `${snake}es`;
  return `${snake}s`;
}

function classType(source: SourceFile, phpClass: PhpClass): NodeType {
  if (source.path.includes("/Controllers/")) return "controller";
  if (source.path.includes("/Requests/")) return "form_request";
  if (source.path.includes("/Models/") || phpClass.parent?.endsWith("Model")) return "model";
  return "class";
}

class GraphBuilder {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly edges = new Map<string, GraphEdge>();
  readonly warnings: string[] = [];

  constructor(readonly project: ProjectMetadata) {}

  addNode(node: GraphNode): void {
    const existing = this.nodes.get(node.id);
    if (!existing) {
      this.nodes.set(node.id, node);
      return;
    }
    existing.attributes = { ...existing.attributes, ...node.attributes };
    for (const item of node.evidence) {
      if (!existing.evidence.some((current) => JSON.stringify(current) === JSON.stringify(item))) {
        existing.evidence.push(item);
      }
    }
  }

  addEdge(edge: GraphEdge): void {
    const existing = this.edges.get(edge.id);
    if (!existing) {
      this.edges.set(edge.id, edge);
      return;
    }
    for (const item of edge.evidence) {
      if (!existing.evidence.some((current) => JSON.stringify(current) === JSON.stringify(item))) {
        existing.evidence.push(item);
      }
    }
  }

  finish(): AnalysisGraph {
    return analysisGraphSchema.parse({
      schemaVersion: "1.0",
      project: this.project,
      nodes: [...this.nodes.values()].sort((left, right) => left.id.localeCompare(right.id)),
      edges: [...this.edges.values()].sort((left, right) => left.id.localeCompare(right.id)),
      warnings: this.warnings,
    });
  }
}

function node(
  id: string,
  type: NodeType,
  name: string,
  attributes: Record<string, unknown> = {},
  sourceEvidence: Evidence[] = [],
): GraphNode {
  return { id, type, name, attributes, evidence: sourceEvidence };
}

function edge(
  type: EdgeType,
  source: string,
  target: string,
  sourceEvidence: Evidence[],
  confidence: Confidence = "certain",
): GraphEdge {
  return {
    id: edgeId(type, source, target),
    type,
    source,
    target,
    evidence: sourceEvidence,
    confidence,
    attributes: {},
  };
}

async function projectMetadata(root: string): Promise<ProjectMetadata> {
  const composer = JSON.parse(await readFile(path.join(root, "composer.json"), "utf8")) as {
    name?: string;
    require?: Record<string, string>;
  };
  return {
    name: composer.name ?? path.basename(root),
    root,
    ...(composer.require?.php ? { phpConstraint: composer.require.php } : {}),
    ...(composer.require?.["laravel/framework"]
      ? { laravelConstraint: composer.require["laravel/framework"] }
      : {}),
  };
}

export async function analyzeRepository(repository: string): Promise<AnalysisGraph> {
  const root = path.resolve(repository);
  const details = await stat(root).catch(() => undefined);
  if (!details?.isDirectory()) {
    throw new Error(`Repository directory does not exist: ${root}`);
  }
  await stat(path.join(root, "composer.json")).catch(() => {
    throw new Error(`Not a Composer project (composer.json missing): ${root}`);
  });

  const builder = new GraphBuilder(await projectMetadata(root));
  const projectId = `project:${builder.project.name}`;
  builder.addNode(node(projectId, "project", builder.project.name));

  const sources = await scanPhpFiles(root);
  const classes = new Map<string, { source: SourceFile; phpClass: PhpClass; type: NodeType }>();
  const shortNames = new Map<string, string>();

  for (const source of sources) {
    const fileId = `file:${source.path}`;
    const fileEvidence: Evidence = {
      path: source.path,
      startLine: 1,
      endLine: Math.max(1, source.text.split("\n").length),
      kind: "source_file",
      confidence: "certain",
    };
    builder.addNode(node(fileId, "file", path.basename(source.path), { path: source.path }, [fileEvidence]));
    builder.addEdge(edge("contains", projectId, fileId, [fileEvidence]));

    const parsed = parsePhpFile(source);
    if (parsed.hasSyntaxErrors) builder.warnings.push(`PHP syntax error detected in ${source.path}`);
    for (const phpClass of parsed.classes) {
      const type = classType(source, phpClass);
      const classId = `class:${phpClass.qualifiedName}`;
      const classEvidence: Evidence = {
        path: source.path,
        startLine: phpClass.startLine,
        endLine: phpClass.startLine,
        kind: "class_declaration",
        confidence: "certain",
      };
      builder.addNode(
        node(classId, type, phpClass.name, { qualifiedName: phpClass.qualifiedName }, [classEvidence]),
      );
      builder.addEdge(edge("declares", fileId, classId, [classEvidence]));
      classes.set(phpClass.qualifiedName, { source, phpClass, type });
      shortNames.set(phpClass.name, phpClass.qualifiedName);

      if (phpClass.parent) {
        const parent = resolvePhpName(phpClass, phpClass.parent);
        const parentId = `class:${parent}`;
        builder.addNode(node(parentId, "class", parent.split("\\").at(-1) ?? parent, { qualifiedName: parent }));
        builder.addEdge(edge("extends", classId, parentId, [classEvidence]));
      }

      for (const method of phpClass.methods) {
        const methodId = `method:${phpClass.qualifiedName}::${method.name}`;
        const methodEvidence: Evidence = {
          path: source.path,
          startLine: method.startLine,
          endLine: method.endLine,
          kind: "method_declaration",
          confidence: "certain",
        };
        builder.addNode(node(methodId, "method", method.name, { owner: classId }, [methodEvidence]));
        builder.addEdge(edge("declares", classId, methodId, [methodEvidence]));
        for (const parameter of method.parameters) {
          const resolved = resolvePhpName(phpClass, parameter);
          if (resolved.endsWith("Request")) {
            const requestId = `class:${resolved}`;
            builder.addNode(
              node(requestId, "form_request", resolved.split("\\").at(-1) ?? resolved, {
                qualifiedName: resolved,
              }),
            );
            builder.addEdge(edge("accepts", methodId, requestId, [methodEvidence]));
          }
        }
      }
    }
  }

  for (const source of sources) {
    for (const match of source.text.matchAll(schemaCreatePattern)) {
      const table = match.groups?.table;
      if (!table || match.index === undefined) continue;
      const tableId = `table:${table}`;
      const sourceEvidence = evidence(source, match.index, "schema_create");
      builder.addNode(node(tableId, "table", table, {}, [sourceEvidence]));
      builder.addEdge(edge("creates_table", `file:${source.path}`, tableId, [sourceEvidence]));
    }
  }

  for (const [qualifiedName, item] of classes) {
    const { source, phpClass, type } = item;
    const classId = `class:${qualifiedName}`;
    if (type === "model") {
      const tableMatch = /protected\s+\$table\s*=\s*['"]([^'"]+)['"]/.exec(source.text);
      const table = tableMatch?.[1] ?? snakePlural(phpClass.name);
      const confidence: Confidence = tableMatch ? "certain" : "probable";
      const tableId = `table:${table}`;
      const sourceEvidence = evidence(
        source,
        tableMatch?.index ?? source.text.indexOf("class"),
        "model_table",
        confidence,
      );
      builder.addNode(node(tableId, "table", table, {}, [sourceEvidence]));
      builder.addEdge(edge("persists_to", classId, tableId, [sourceEvidence], confidence));
    }

    for (const match of source.text.matchAll(relationPattern)) {
      const relation = match.groups?.relation;
      const modelName = match.groups?.model;
      if (!relation || !modelName || match.index === undefined) continue;
      const initiallyResolved = resolvePhpName(phpClass, modelName);
      const resolved = shortNames.get(initiallyResolved) ?? shortNames.get(modelName) ?? initiallyResolved;
      const targetId = `class:${resolved}`;
      const relationType = relation.replace(/(?<!^)(?=[A-Z])/g, "_").toLowerCase() as EdgeType;
      const sourceEvidence = evidence(source, match.index, "eloquent_relationship");
      builder.addNode(
        node(targetId, "model", resolved.split("\\").at(-1) ?? resolved, { qualifiedName: resolved }),
      );
      builder.addEdge(edge(relationType, classId, targetId, [sourceEvidence]));
    }

    for (const method of phpClass.methods) {
      const methodId = `method:${qualifiedName}::${method.name}`;
      for (const match of method.body.matchAll(staticModelCallPattern)) {
        const modelName = match.groups?.model;
        if (!modelName || match.index === undefined) continue;
        const initiallyResolved = resolvePhpName(phpClass, modelName);
        const resolved = shortNames.get(initiallyResolved) ?? shortNames.get(modelName) ?? initiallyResolved;
        const targetId = `class:${resolved}`;
        const sourceEvidence = evidence(
          source,
          method.bodyStartIndex + match.index,
          "static_model_call",
        );
        builder.addNode(node(targetId, "model", modelName, { qualifiedName: resolved }));
        builder.addEdge(edge("uses", methodId, targetId, [sourceEvidence]));
      }
    }
  }

  for (const source of sources.filter((item) => item.path.startsWith("routes/"))) {
    const imports = new Map<string, string>();
    for (const match of source.text.matchAll(/^\s*use\s+([^;]+);/gm)) {
      const imported = match[1]?.trim();
      if (imported) imports.set(imported.split("\\").at(-1) ?? imported, imported);
    }
    for (const match of source.text.matchAll(routePattern)) {
      const verb = match.groups?.verb?.toUpperCase();
      const uri = match.groups?.uri;
      const rawController = match.groups?.controller?.replace(/^\\/, "");
      const methodName = match.groups?.method;
      if (!verb || uri === undefined || !rawController || !methodName || match.index === undefined) continue;
      const controller = imports.get(rawController) ?? rawController;
      const routeId = `route:${verb}:${uri}`;
      const methodId = `method:${controller}::${methodName}`;
      const sourceEvidence = evidence(source, match.index, "route_declaration");
      builder.addNode(node(routeId, "route", `${verb} ${uri}`, { method: verb, uri }, [sourceEvidence]));
      builder.addNode(node(methodId, "method", methodName, { owner: `class:${controller}` }));
      builder.addEdge(edge("handled_by", routeId, methodId, [sourceEvidence]));
    }
  }

  return builder.finish();
}

