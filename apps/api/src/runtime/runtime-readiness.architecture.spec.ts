import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Runtime readiness architecture', () => {
  const readinessSource = readFileSync(
    resolve(__dirname, 'runtime-readiness.service.ts'),
    'utf8',
  );
  const composeSource = readFileSync(
    resolve(__dirname, '../../../../docker-compose.yml'),
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

  it('gates API and Uber worker startup on PostgreSQL health', () => {
    const db = composeSource.slice(
      composeSource.indexOf('  db:'),
      composeSource.indexOf('  api:'),
    );
    const api = composeSource.slice(
      composeSource.indexOf('  api:'),
      composeSource.indexOf('  ubereats-worker:'),
    );
    const worker = composeSource.slice(
      composeSource.indexOf('  ubereats-worker:'),
      composeSource.indexOf('  web:'),
    );

    expect(db).toContain('pg_isready');
    expect(api).toContain("fetch('http://127.0.0.1:4000/api/v1/ready')");
    expect(worker).toContain("fetch('http://127.0.0.1:4001/ready')");
    expect(api).toContain('condition: service_healthy');
    expect(worker).toContain('condition: service_healthy');
  });

  it('does not promote Web/API coupling into a readiness dependency before R4', () => {
    const web = composeSource.slice(composeSource.indexOf('  web:'));

    expect(web).toContain('condition: service_started');
    expect(web).not.toContain('condition: service_healthy');
    expect(web).not.toContain('healthcheck:');
  });
});
