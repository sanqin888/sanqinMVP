import { CustomerExistenceService } from './customer-existence.service';

describe('CustomerExistenceService', () => {
  it('returns true only for a CUSTOMER stable identity', async () => {
    const userFindUnique = jest.fn().mockResolvedValue({ role: 'CUSTOMER' });
    const service = new CustomerExistenceService({
      user: { findUnique: userFindUnique },
    } as never);

    await expect(service.customerExists('user-stable-1')).resolves.toBe(true);
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { userStableId: 'user-stable-1' },
      select: { role: true },
    });
  });

  it.each(['STAFF', 'ADMIN', 'ACCOUNTANT'])(
    'returns false when the stable identity belongs to %s',
    async (role) => {
      const userFindUnique = jest.fn().mockResolvedValue({ role });
      const service = new CustomerExistenceService({
        user: { findUnique: userFindUnique },
      } as never);

      await expect(
        service.customerExists('staff-stable-id'),
      ).resolves.toBe(false);
    },
  );

  it('returns false for a missing customer', async () => {
    const userFindUnique = jest.fn().mockResolvedValue(null);
    const service = new CustomerExistenceService({
      user: { findUnique: userFindUnique },
    } as never);

    await expect(service.customerExists('missing-member')).resolves.toBe(false);
  });
});
