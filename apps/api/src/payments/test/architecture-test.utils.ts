import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

export type SourceFile = { path: string; source: string };

export const scanTypeScript = (
  root: string,
  options: { productionOnly?: boolean } = {},
): SourceFile[] =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return scanTypeScript(path, options);
    if (!entry.isFile() || !path.endsWith('.ts')) return [];
    if (
      options.productionOnly &&
      (path.includes('.spec.') || path.includes(`${sep}test${sep}`))
    ) {
      return [];
    }
    return [{ path, source: readFileSync(path, 'utf8') }];
  });

export const importSpecifiers = (source: string): string[] => {
  const matches = [
    ...source.matchAll(
      /(?:import|export)\s+(?:type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g,
    ),
    ...source.matchAll(/import\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(
      /(?:import\s*\(|require\s*\()\s*['"]([^'"]+)['"]\s*\)/g,
    ),
  ];
  return [...new Set(matches.map((match) => match[1]))];
};

export const importViolations = (
  files: readonly SourceFile[],
  root: string,
  forbidden: (specifier: string, file: SourceFile) => boolean,
): string[] =>
  files.flatMap((file) =>
    importSpecifiers(file.source)
      .filter((specifier) => forbidden(specifier, file))
      .map((specifier) => `${relative(root, file.path)} -> ${specifier}`),
  );

export type InterfaceMethods = { interfaceName: string; methods: string[] };

export const interfaceMethods = (file: SourceFile): InterfaceMethods[] => {
  const sourceFile = ts.createSourceFile(
    file.path,
    file.source,
    ts.ScriptTarget.Latest,
    true,
  );

  return sourceFile.statements.flatMap((node) =>
    ts.isInterfaceDeclaration(node)
      ? [
          {
            interfaceName: node.name.text,
            methods: node.members.flatMap((member) =>
              ts.isMethodSignature(member)
                ? [member.name.getText(sourceFile)]
                : [],
            ),
          },
        ]
      : [],
  );
};
