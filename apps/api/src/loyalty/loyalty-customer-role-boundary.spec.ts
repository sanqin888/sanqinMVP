import { BadRequestException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService customer identity boundary', () => {
  it('resolves only CUSTOMER stable identities for Loyalty operations', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'customer-db-id',
      role: 'CUSTOMER',
    });
    const service = new LoyaltyService(
      { user: { findUnique } } as never,
      {} as never,
    );

    await expect(
      service.resolveUserIdByStableId('customer-stable-id'),
    ).resolves.toBe('customer-db-id');
    expect(findUnique).toHaveBeenCalledWith({
      where: { userStableId: 'customer-stable-id' },
      select: { id: true, role: true },
    });
  });

  it.each(['STAFF', 'ADMIN', 'ACCOUNTANT'] as const)(
    'rejects %s stable identities as non-members',
    async (role) => {
      const service = new LoyaltyService(
        {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'non-customer-db-id',
              role,
            }),
          },
        } as never,
        {} as never,
      );

      await expect(
        service.resolveUserIdByStableId('non-customer-stable-id'),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
