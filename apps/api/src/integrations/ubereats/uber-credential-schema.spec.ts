import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Uber credential schema boundary', () => {
  it('只允许加密的商户 token 字段', () => {
    const schema = readFileSync(
      resolve(__dirname, '../../../prisma/schema.prisma'),
      'utf8',
    );
    const model = schema.match(
      /model UberMerchantConnection\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    expect(model).toBeDefined();
    expect(model).toMatch(/\bencryptedAccessToken\s+String\?/);
    expect(model).toMatch(/\bencryptedRefreshToken\s+String\?/);
    expect(model).not.toMatch(/^\s*accessToken\s+/m);
    expect(model).not.toMatch(/^\s*refreshToken\s+/m);
  });

  it('持久化适配器不读取或写入明文 token 列', () => {
    const persistenceDirectory = resolve(
      __dirname,
      'infrastructure/persistence',
    );
    const source = [
      'uber-merchant-persistence.adapter.ts',
      'uber-menu-prisma.adapter.ts',
    ]
      .map((file) => readFileSync(resolve(persistenceDirectory, file), 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/\brow\.(?:accessToken|refreshToken)\b/);
  });
});
