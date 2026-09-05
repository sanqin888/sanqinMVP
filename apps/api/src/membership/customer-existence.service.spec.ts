import { CustomerExistenceService } from './customer-existence.service';

describe('CustomerExistenceService', () => {
  it('checks existence by userStableId without returning the DB UUID', async () => {
    const userFindUnique = jest
      .fn()
      .mockResolvedValue({ userStableId: 'user-stable-1' });
    const service = new CustomerExistenceService({
      user: { findUnique: userFindUnique },
    } as never);

    await expect(service.customerExists('user-stable-1')).resolves.toBe(true);
    expect(userFindUnique).toHaveBeenCalledWith({
      where: { userStableId: 'user-stable-1' },
      select: { userStableId: true },
    });
  });

  it('returns false for a missing customer', async () => {
    const userFindUnique = jest.fn().mockResolvedValue(null);
    const service = new CustomerExistenceService({
      user: { findUnique: userFindUnique },
    } as never);

    await expect(service.customerExists('missing-member')).resolves.toBe(false);
  });
});
