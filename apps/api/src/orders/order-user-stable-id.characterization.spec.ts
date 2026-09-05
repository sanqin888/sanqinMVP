import { readFileSync } from 'fs';
import { join } from 'path';

describe('Order member stable identity persistence', () => {
  const schema = readFileSync(
    join(__dirname, '../../prisma/schema.prisma'),
    'utf8',
  );
  const migration = readFileSync(
    join(
      __dirname,
      '../../prisma/migrations/20260905145500_add_order_user_stable_id/migration.sql',
    ),
    'utf8',
  );

  it('keeps userId while adding nullable userStableId plus the member-read index', () => {
    expect(schema).toMatch(
      /model Order \{[\s\S]*?userId\s+String\?[\s\S]*?userStableId\s+String\?/,
    );
    expect(schema).toContain('@@index([userStableId, createdAt])');
  });

  it('backfills deterministically from User.userStableId and rejects discrepancies', () => {
    expect(migration).toContain('SET "userStableId" = u."userStableId"');
    expect(migration).toContain('o."userId" = u."id"');
    expect(migration).toContain('populated_stable_id_count');
    expect(migration).toContain('mismatched_stable_id_count');
    expect(migration).toContain('orphan_user_id_count');
    expect(migration).not.toMatch(/random\(|clock_timestamp\(|gen_random_uuid\(/i);
  });

  it('dual-writes the stable member identity on every member Order creation path', () => {
    const ordersService = readFileSync(
      join(__dirname, './orders.service.ts'),
      'utf8',
    );
    const loyaltyService = readFileSync(
      join(__dirname, '../loyalty/loyalty.service.ts'),
      'utf8',
    );

    expect(ordersService).toContain(
      'userStableId: snapshot.order.userStableId ?? null',
    );
    expect(ordersService).toContain(
      'userStableId: normalizedUserStableId ?? null',
    );
    expect(loyaltyService).toMatch(
      /tx\.order\.create\([\s\S]*?userId,[\s\S]*?userStableId: normalizedUserStableId,[\s\S]*?subtotalCents: cents/,
    );
  });
});
