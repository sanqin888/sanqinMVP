import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'glob';

describe('Uber Eats persistence architecture', () => {
  it('keeps Prisma out of application, domain and api production code', () => {
    // Existing workflow files are migrated incrementally; this fixed baseline
    // prevents the dependency from spreading while each large workflow is
    // moved behind the semantic ports above.
    const legacyAllowlist = new Set([
      'application/menu/uber-menu.service.ts',
      'application/menu/uber-menu.workflow.ts',
      'application/operations/uber-operations.service.ts',
      'application/orders/uber-order-outbox.service.ts',
      'application/orders/uber-order-status-sync.service.ts',
      'application/orders/uber-order.use-cases.ts',
      'application/orders/uber-order.workflow.ts',
      'application/orders/uber-webhook.service.ts',
      'api/operations.controller.ts',
      'domain/operations/uber-operations.types.ts',
      'domain/orders/uber-order-payload.parser.ts',
      'domain/orders/uber-order.state-machine.ts',
      'domain/orders/uber-order.types.ts',
    ]);
    const root = join(__dirname);
    const files = ['application', 'domain', 'api'].flatMap((layer) =>
      globSync(`${layer}/**/*.ts`, {
        cwd: root,
        absolute: true,
        ignore: ['**/*.spec.ts'],
      }),
    );

    const violations = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      const relative = file.replace(`${root}/`, '');
      return (
        !legacyAllowlist.has(relative) &&
        /from ['"]@prisma\/client['"]|PrismaService/.test(source)
      );
    });

    expect(violations.map((file) => file.replace(`${root}/`, ''))).toEqual([]);
  });
});
