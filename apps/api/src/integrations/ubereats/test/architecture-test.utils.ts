import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

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
    if (
      options.productionOnly &&
      (path.includes('.spec.') || path.includes(`${sep}test${sep}`))
    )
      return [];
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

export type InterfaceMethods = { interfaceName: string; methods: string[] };

/** Reads interface method declarations structurally, without relying on text layout. */
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

/** Returns every named type referenced by each class constructor parameter. */
export const constructorDependencyTypes = (
  file: SourceFile,
): Array<{ className: string; parameterTypes: string[][] }> => {
  const sourceFile = ts.createSourceFile(
    file.path,
    file.source,
    ts.ScriptTarget.Latest,
    true,
  );
  const typeNames = (node: ts.TypeNode): string[] => {
    const names: string[] = [];
    const visit = (child: ts.Node) => {
      if (ts.isTypeReferenceNode(child)) names.push(child.typeName.getText());
      ts.forEachChild(child, visit);
    };
    visit(node);
    return [...new Set(names)];
  };

  return sourceFile.statements.flatMap((node) => {
    if (!ts.isClassDeclaration(node) || !node.name) return [];
    const constructor = node.members.find(ts.isConstructorDeclaration);
    return constructor
      ? [
          {
            className: node.name.text,
            parameterTypes: constructor.parameters.map((parameter) =>
              parameter.type ? typeNames(parameter.type) : [],
            ),
          },
        ]
      : [];
  });
};

/** Finds unsafe wire-shaped values anywhere in an application port method result. */
export const portMethodReturnTypeViolations = (
  files: readonly SourceFile[],
  root: string,
): string[] => {
  const sources = new Map(files.map((file) => [file.path, file.source]));
  const host = ts.createCompilerHost({ strict: true, noEmit: true });
  host.readFile = (path) => sources.get(path) ?? ts.sys.readFile(path);
  host.fileExists = (path) => sources.has(path) || ts.sys.fileExists(path);

  const program = ts.createProgram({
    rootNames: [...sources.keys()],
    options: { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022 },
    host,
  });
  const checker = program.getTypeChecker();

  const containsUnsafeType = (
    type: ts.Type,
    seen = new Set<ts.Type>(),
  ): boolean => {
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return true;
    if (seen.has(type) || type.flags & ts.TypeFlags.TypeParameter) return false;
    seen.add(type);

    if (type.isUnionOrIntersection()) {
      return type.types.some((member) => containsUnsafeType(member, seen));
    }
    if (
      checker
        .getTypeArguments(type as ts.TypeReference)
        .some((argument) => containsUnsafeType(argument, seen))
    ) {
      return true;
    }
    if (
      checker
        .getIndexInfosOfType(type)
        .some((index) => containsUnsafeType(index.type, seen))
    ) {
      return true;
    }

    return checker.getPropertiesOfType(type).some((property) => {
      const declaration =
        property.valueDeclaration ?? property.declarations?.[0];
      if (!declaration || declaration.getSourceFile().isDeclarationFile)
        return false;
      return containsUnsafeType(
        checker.getTypeOfSymbolAtLocation(property, declaration),
        seen,
      );
    });
  };

  return files.flatMap((file) => {
    const sourceFile = program.getSourceFile(file.path);
    if (!sourceFile) return [];
    const violations: string[] = [];
    sourceFile.forEachChild((node) => {
      if (!ts.isInterfaceDeclaration(node)) return;
      for (const member of node.members) {
        if (!ts.isMethodSignature(member) || !member.type) continue;
        if (containsUnsafeType(checker.getTypeFromTypeNode(member.type))) {
          violations.push(
            formatSourceViolation(
              root,
              file,
              `${node.name.text}.${member.name.getText(sourceFile)}`,
            ),
          );
        }
      }
    });
    return violations;
  });
};

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
