import { writeFile } from "node:fs/promises";

import { analyzeRepository } from "./analyzer.js";

interface Arguments {
  repository: string;
  output?: string;
  pretty: boolean;
}

function usage(): never {
  console.error("Usage: repolens <repository> [--output file] [--pretty]");
  process.exit(2);
}

function parseArguments(values: string[]): Arguments {
  const repository = values[0];
  if (!repository || repository.startsWith("-")) usage();
  const outputIndex = values.indexOf("--output");
  const output = outputIndex >= 0 ? values[outputIndex + 1] : undefined;
  if (outputIndex >= 0 && !output) usage();
  return { repository, ...(output ? { output } : {}), pretty: values.includes("--pretty") };
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  try {
    const graph = await analyzeRepository(args.repository);
    const payload = `${JSON.stringify(graph, null, args.pretty ? 2 : undefined)}\n`;
    if (args.output) await writeFile(args.output, payload, "utf8");
    else process.stdout.write(payload);
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}

await main();

