import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const ACCOUNTING_ROOT = resolve(__dirname, '..');

type SourceFile = {
  relativePath: string;
  source: string;
};

function walkSourceFiles(root: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(root)) {
    const fullPath = resolve(root, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...walkSourceFiles(fullPath));
      continue;
    }

    if (/\.tsx?$/.test(entry)) {
      files.push(fullPath);
    }
  }

  return files;
}

function isTestSource(path: string): boolean {
  return /\.(?:test|spec)\.tsx?$/.test(path);
}

function importedContractTypes(source: string): Set<string> {
  const imported = new Set<string>();
  const importPattern =
    /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]*contracts\/[^'"]+)['"]/g;

  for (const match of source.matchAll(importPattern)) {
    const importedNames = match[1];
    if (!importedNames) continue;

    for (const rawName of importedNames.split(',')) {
      const normalized = rawName.trim().replace(/^type\s+/, '');
      if (!normalized) continue;
      const [importedName = '', alias] = normalized.split(/\s+as\s+/);
      if (importedName) imported.add(alias ?? importedName);
    }
  }

  return imported;
}

function localTypeNames(source: string): Set<string> {
  const names = Array.from(
    source.matchAll(
      /(?:^|\n)\s*(?:export\s+)?(?:type|interface)\s+([A-Z][A-Za-z0-9_]*)\b/g,
    ),
    (match) => match[1],
  ).filter((name): name is string => Boolean(name));

  return new Set(names);
}

function apiFetchTypeRoots(source: string): string[] {
  return Array.from(
    source.matchAll(/apiFetch<\s*([A-Z][A-Za-z0-9_]*)/g),
    (match) => match[1],
  ).filter((name): name is string => Boolean(name));
}

const productionSources: SourceFile[] = walkSourceFiles(ACCOUNTING_ROOT)
  .filter((path) => !isTestSource(path))
  .filter((path) => !path.includes(`${sep}contracts${sep}`))
  .map((path) => ({
    relativePath: relative(ACCOUNTING_ROOT, path),
    source: readFileSync(path, 'utf8'),
  }));

const accountingHttpSources = productionSources.filter(({ source }) =>
  /['"`]\/accounting\//.test(source),
);

describe('Phase 9 Slice 8B-E Accounting Web contract architecture', () => {
  it('requires named Accounting HTTP response DTOs to come from contracts', () => {
    const violations: string[] = [];

    for (const file of accountingHttpSources) {
      const contractTypes = importedContractTypes(file.source);

      for (const responseType of apiFetchTypeRoots(file.source)) {
        if (!contractTypes.has(responseType)) {
          violations.push(`${file.relativePath}: ${responseType}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('prevents page-local and inline Accounting HTTP response DTO drift', () => {
    const localTypeViolations: string[] = [];
    const inlineTypeViolations: string[] = [];

    for (const file of accountingHttpSources) {
      const locals = localTypeNames(file.source);

      for (const responseType of apiFetchTypeRoots(file.source)) {
        if (locals.has(responseType)) {
          localTypeViolations.push(`${file.relativePath}: ${responseType}`);
        }
      }

      if (/apiFetch<\s*\{/.test(file.source)) {
        inlineTypeViolations.push(file.relativePath);
      }
    }

    expect(localTypeViolations).toEqual([]);
    expect(inlineTypeViolations).toEqual([]);
  });

  it('keeps vertical-private UI models and helpers inside their owning vertical', () => {
    const violations: string[] = [];

    for (const file of productionSources) {
      if (
        !file.relativePath.startsWith(`inbox${sep}`) &&
        file.source.includes('inbox/inbox-model')
      ) {
        violations.push(`${file.relativePath}: inbox/inbox-model`);
      }

      if (
        !file.relativePath.startsWith(`payroll${sep}`) &&
        file.source.includes('payroll/payroll-ui')
      ) {
        violations.push(`${file.relativePath}: payroll/payroll-ui`);
      }
    }

    expect(violations).toEqual([]);
    expect(
      existsSync(resolve(ACCOUNTING_ROOT, 'settlements', 'settlement-model.ts')),
    ).toBe(false);
    expect(
      existsSync(resolve(ACCOUNTING_ROOT, 'payroll', 'payroll-types.ts')),
    ).toBe(false);
  });

  it('keeps the Audit Web contract on canonical operatorActorRef semantics', () => {
    const auditContract = readFileSync(resolve(__dirname, 'audit.ts'), 'utf8');
    const auditPage = readFileSync(
      resolve(ACCOUNTING_ROOT, 'audit-logs', 'page.tsx'),
      'utf8',
    );

    expect(auditContract).toContain('operatorActorRef: string');
    expect(auditContract).not.toContain('operatorUserId');
    expect(auditPage).toContain('row.operatorActorRef');
    expect(auditPage).not.toContain('operatorUserId');
  });

  it('keeps the final 8B tail responses on explicit contract projections', () => {
    const inboxContract = readFileSync(resolve(__dirname, 'inbox.ts'), 'utf8');
    const automationContract = readFileSync(
      resolve(__dirname, 'automation-period.ts'),
      'utf8',
    );
    const reconciliationPage = readFileSync(
      resolve(ACCOUNTING_ROOT, 'reconciliation', 'page.tsx'),
      'utf8',
    );

    expect(inboxContract).toContain(
      'export type AccountingManualUploadPermanentDeleteResult',
    );
    expect(inboxContract).toContain('removedDuplicateCount: number');
    expect(automationContract).toContain(
      'export type AccountingUberFinancialReport',
    );
    expect(automationContract).toContain('errorMessage: string | null');
    expect(reconciliationPage).not.toContain('type UberReport =');
  });
});
