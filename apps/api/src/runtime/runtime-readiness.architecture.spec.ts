import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Runtime readiness architecture', () => {
  const readinessSource = readFileSync(
    resolve(__dirname, 'runtime-readiness.service.ts'),
    'utf8',
  );

  it('keeps API readiness limited to local runtime-owned dependencies', () => {
    expect(readinessSource).toContain("from '../prisma/prisma.service'");
    expect(readinessSource).not.toMatch(/\.\.\/common\//);
    expect(readinessSource).not.toMatch(
      /(?:clover|ubereats|sendgrid|twilio|aws|google|gmail)/i,
    );
  });

  it('does not turn migration execution into an HTTP health side effect', () => {
    expect(readinessSource).not.toMatch(
      /migrate\s+(?:deploy|dev|reset)|prisma\s+migrate|db\s+push/i,
    );
  });
});
