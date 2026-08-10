import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'glob';

describe('Uber Eats persistence architecture', () => {
  it('keeps Prisma out of application, domain and api production code', () => {
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
      return /from ['"]@prisma\/client['"]|PrismaService/.test(source);
    });

    expect(violations.map((file) => file.replace(`${root}/`, ''))).toEqual([]);
  });
});
