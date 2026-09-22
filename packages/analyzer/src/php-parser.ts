import Parser, { type SyntaxNode } from "tree-sitter";
import PHP from "tree-sitter-php";

import type { SourceFile } from "./source.js";

export interface PhpMethod {
  name: string;
  startLine: number;
  endLine: number;
  parameters: string[];
  body: string;
  bodyStartIndex: number;
}

export interface PhpClass {
  name: string;
  qualifiedName: string;
  namespace: string;
  startLine: number;
  parent?: string;
  imports: Map<string, string>;
  methods: PhpMethod[];
}

export interface ParsedPhpFile {
  classes: PhpClass[];
  hasSyntaxErrors: boolean;
}

const parser = new Parser();
parser.setLanguage(PHP.php);

function descendants(node: SyntaxNode, type: string): SyntaxNode[] {
  const matches: SyntaxNode[] = [];
  const visit = (current: SyntaxNode) => {
    if (current.type === type) {
      matches.push(current);
    }
    for (const child of current.namedChildren) {
      visit(child);
    }
  };
  visit(node);
  return matches;
}

export function importsFrom(source: string): Map<string, string> {
  const imports = new Map<string, string>();
  for (const match of source.matchAll(/^\s*use\s+([^;{]+);/gm)) {
    const statement = match[1];
    if (!statement) continue;
    for (const entry of statement.split(",")) {
      const imported = /^(?<name>[\\\w]+)(?:\s+as\s+(?<alias>\w+))?$/i.exec(entry.trim());
      const name = imported?.groups?.name?.replace(/^\\/, "");
      if (name) {
        imports.set(imported?.groups?.alias ?? name.split("\\").at(-1) ?? name, name);
      }
    }
  }
  return imports;
}

export function resolvePhpName(phpClass: PhpClass, name: string): string {
  if (name.startsWith("\\")) return name.slice(1);
  const [first, ...rest] = name.split("\\");
  const imported = phpClass.imports.get(first ?? "");
  if (imported) return [imported, ...rest].join("\\");
  return phpClass.namespace ? `${phpClass.namespace}\\${name}` : name;
}

export function parsePhpFile(source: SourceFile): ParsedPhpFile {
  const tree = parser.parse(source.text);
  const namespace = source.text.match(/\bnamespace\s+([^;]+);/)?.[1]?.trim() ?? "";
  const imports = importsFrom(source.text);
  const classes: PhpClass[] = [];

  for (const classNode of descendants(tree.rootNode, "class_declaration")) {
    const nameNode = classNode.childForFieldName("name");
    if (!nameNode) {
      continue;
    }
    const name = nameNode.text;
    const qualifiedName = namespace ? `${namespace}\\${name}` : name;
    const baseClause = classNode.namedChildren.find((child) => child.type === "base_clause");
    const rawParent = baseClause?.namedChildren.at(-1)?.text;
    const bodyNode = classNode.childForFieldName("body");
    const methods: PhpMethod[] = [];

    if (bodyNode) {
      for (const methodNode of descendants(bodyNode, "method_declaration")) {
        const methodName = methodNode.childForFieldName("name")?.text;
        const parametersNode = methodNode.childForFieldName("parameters");
        const methodBody = methodNode.childForFieldName("body");
        if (!methodName || !methodBody) {
          continue;
        }
        const parameters = [...(parametersNode?.text.matchAll(/([\\\w]+)\s+\$\w+/g) ?? [])]
          .map((match) => match[1])
          .filter((value): value is string => Boolean(value));
        methods.push({
          name: methodName,
          startLine: methodNode.startPosition.row + 1,
          endLine: methodNode.endPosition.row + 1,
          parameters,
          body: methodBody.text,
          bodyStartIndex: methodBody.startIndex,
        });
      }
    }

    classes.push({
      name,
      qualifiedName,
      namespace,
      startLine: classNode.startPosition.row + 1,
      ...(rawParent ? { parent: rawParent } : {}),
      imports,
      methods,
    });
  }

  return { classes, hasSyntaxErrors: tree.rootNode.hasError };
}
