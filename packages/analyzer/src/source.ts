import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface SourceFile {
  path: string;
  text: string;
}

const ignoredDirectories = new Set([".git", "node_modules", "storage", "vendor"]);

async function visit(root: string, directory: string, files: SourceFile[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        await visit(root, absolutePath, files);
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".php")) {
      files.push({
        path: path.relative(root, absolutePath).split(path.sep).join("/"),
        text: await readFile(absolutePath, "utf8"),
      });
    }
  }
}

export async function scanPhpFiles(root: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  await visit(root, root, files);
  return files;
}

export function lineAt(source: SourceFile, offset: number): number {
  return source.text.slice(0, Math.max(0, offset)).split("\n").length;
}

