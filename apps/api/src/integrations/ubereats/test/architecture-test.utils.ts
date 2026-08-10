import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

export type SourceFile = { path: string; source: string };

/** The single recursive scanner used by all Uber Eats architecture checks. */
export const scanTypeScript = (
  root: string,
  options: { productionOnly?: boolean } = {},
): SourceFile[] =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return scanTypeScript(path, options);
    if (!entry.isFile() || !path.endsWith('.ts')) return [];
    if (options.productionOnly && path.includes('.spec.')) return [];
    return [{ path, source: readFileSync(path, 'utf8') }];
  });

export const importSpecifiers = (source: string): string[] => {
  const matches = [
    ...source.matchAll(
      /(?:import|export)\s+(?:type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g,
    ),
    ...source.matchAll(/import\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/(?:import\s*\(|require\s*\()\s*['"]([^'"]+)['"]\s*\)/g),
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

export const formatSourceViolation = (
  root: string,
  file: SourceFile,
  token: string,
): string => `${relative(root, file.path)} -> ${token}`;

export const writeGatewayViolations = (
  files: readonly SourceFile[],
  root: string,
): string[] => {
  const violations: string[] = [];
  for (const file of files) {
    const calls = file.source.matchAll(
      /(?:\b(?:gateway|transport)|\b\w*Gateway|\bthis)\.(?:request|inspect)\s*[^\n(]*\(\s*\{([\s\S]*?)^\s*\}\s*\);/gim,
    );
    for (const match of calls) {
      const request = match[1];
      const method = request.match(
        /\bmethod\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/i,
      )?.[1];
      if (method && !/\bidempotencyKey\s*(?::|,)/.test(request)) {
        violations.push(
          formatSourceViolation(
            root,
            file,
            `${method.toUpperCase()} gateway call without idempotencyKey`,
          ),
        );
      }
    }
  }
  return violations;
};
