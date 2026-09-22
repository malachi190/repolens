import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { analyzeRepository } from "@repolens/analyzer";

interface AnalyzerAdapter {
  id: string;
  supports(repository: string): Promise<boolean>;
  analyze(repository: string): ReturnType<typeof analyzeRepository>;
}

const adapters: AnalyzerAdapter[] = [
  {
    id: "laravel",
    async supports(repository) {
      const composerPath = path.join(repository, "composer.json");
      const composer = JSON.parse(await readFile(composerPath, "utf8")) as {
        require?: Record<string, string>;
      };
      return Boolean(composer.require?.["laravel/framework"]);
    },
    analyze: analyzeRepository,
  },
];

async function analyze(repository: string) {
  const root = path.resolve(repository);
  if (!(await stat(root).catch(() => undefined))?.isDirectory()) {
    throw new Error(`Repository directory does not exist: ${root}`);
  }

  for (const adapter of adapters) {
    if (await adapter.supports(root).catch(() => false)) {
      return adapter.analyze(root);
    }
  }
  throw new Error(`No analyzer supports this repository: ${root}`);
}

process.once("message", async (message: unknown) => {
  try {
    if (typeof message !== "object" || message === null || !("repository" in message) ||
      typeof message.repository !== "string") {
      throw new Error("Worker received an invalid repository path");
    }
    const graph = await analyze(message.repository);
    process.send?.({ type: "completed", graph }, () => process.exit(0));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    process.send?.({ type: "failed", error: detail }, () => process.exit(1));
  }
});
