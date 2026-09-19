import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const contractSource = readFileSync(resolve(__dirname, 'audit.ts'), 'utf8');
const pageSource = readFileSync(
  resolve(__dirname, '..', 'audit-logs', 'page.tsx'),
  'utf8',
);

describe('Phase 9 Slice 8B-A Accounting Audit Web contract', () => {
  it(
    'owns the Audit wire shape outside the page and uses actor-reference naming',
    () => {
      expect(contractSource).toContain('export type AccountingAuditLog');
      expect(contractSource).toContain('operatorActorRef: string');
      expect(contractSource).not.toContain('operatorUserId');
      expect(pageSource).toContain(
        "import type { AccountingAuditLog } from '../contracts/audit';",
      );
      expect(pageSource).not.toContain('type AuditLog =');
    },
  );

  it('renders the canonical actor reference rather than the retired user label', () => {
    expect(pageSource).toContain('row.operatorActorRef');
    expect(pageSource).not.toContain('row.operatorUserId');
  });
});
