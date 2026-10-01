import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const promotionsRoot = resolve(__dirname);

describe('Marketing campaign facts boundary', () => {
  it('exports stable campaign identity without leaking persistence IDs or usage counters', () => {
    const contract = readFileSync(
      resolve(promotionsRoot, 'marketing-campaign-facts-reader.contract.ts'),
      'utf8',
    );

    expect(contract).toContain('activityStableId');
    expect(contract).toContain('couponStableId');
    expect(contract).toContain('programStableId');
    expect(contract).not.toMatch(/\bid:\s/);
    expect(contract).not.toContain('usedCount');
    expect(contract).not.toContain('issuedCount');
    expect(contract).not.toContain('Prisma');
  });
});
