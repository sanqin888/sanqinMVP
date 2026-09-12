import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNTING_ROOT = resolve(__dirname);
const API_ROOT = resolve(ACCOUNTING_ROOT, '..');
const AUTH_ROOT = resolve(API_ROOT, 'auth');
const REPORTS_ROOT = resolve(API_ROOT, 'reports');
const ANALYTICS_ROOT = resolve(API_ROOT, 'analytics');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Accounting / Reporting / Analytics staff-auth boundary', () => {
  it('consumes staff auth guards and role metadata through the Identity public surface', () => {
    const controllerSources = [
      resolve(ACCOUNTING_ROOT, 'accounting.controller.ts'),
      resolve(REPORTS_ROOT, 'reports.controller.ts'),
      resolve(ANALYTICS_ROOT, 'analytics.controller.ts'),
    ].map(read);
    const authPublicApi = read(resolve(AUTH_ROOT, 'public-api.ts'));

    for (const source of controllerSources) {
      expect(source).toContain("from '../auth/public-api'");
      expect(source).not.toMatch(
        /from ['"]\.\.\/auth\/(?:session-auth\.guard|roles\.guard|roles\.decorator)['"]/,
      );
    }

    expect(authPublicApi).toContain(
      "export { SessionAuthGuard } from './session-auth.guard';",
    );
    expect(authPublicApi).toContain(
      "export { RolesGuard } from './roles.guard';",
    );
    expect(authPublicApi).toContain(
      "export { Roles } from './roles.decorator';",
    );
  });

  it('keeps only the existing AuthModule Nest composition seams as direct Identity imports', () => {
    const accountingModule = read(
      resolve(ACCOUNTING_ROOT, 'accounting.module.ts'),
    );
    const analyticsModule = read(
      resolve(ANALYTICS_ROOT, 'analytics.module.ts'),
    );
    const reportsModule = read(resolve(REPORTS_ROOT, 'reports.module.ts'));

    expect(accountingModule).toContain(
      "import { AuthModule } from '../auth/auth.module';",
    );
    expect(analyticsModule).toContain(
      "import { AuthModule } from '../auth/auth.module';",
    );
    expect(reportsModule).not.toContain("from '../auth/");
  });
});
