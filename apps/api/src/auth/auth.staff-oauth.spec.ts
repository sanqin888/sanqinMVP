import { AuthService } from './auth.service';

describe('AuthService staff Google OAuth boundary', () => {
  function createService(params: {
    byGoogle?: unknown;
    byEmail?: unknown;
  }) {
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue(params.byGoogle ?? null),
        findUnique: jest.fn().mockResolvedValue(params.byEmail ?? null),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AuthService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, tx };
  }

  it('does not create a customer when a Staff OAuth email has no existing staff identity', async () => {
    const { service, tx } = createService({});

    await expect(
      service.loginWithGoogleOauth({
        googleSub: 'google-staff-1',
        email: 'missing@example.com',
        emailVerified: true,
        name: 'Missing Staff',
        staffOnly: true,
      }),
    ).rejects.toThrow('Staff account required');

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects an existing CUSTOMER before binding Google identity in the Staff flow', async () => {
    const customer = {
      id: 'customer-db-id',
      role: 'CUSTOMER',
      googleSub: null,
      email: 'customer@example.com',
    };
    const { service, tx } = createService({ byEmail: customer });

    await expect(
      service.loginWithGoogleOauth({
        googleSub: 'google-customer-1',
        email: 'customer@example.com',
        emailVerified: true,
        name: 'Customer',
        staffOnly: true,
      }),
    ).rejects.toThrow('Staff account required');

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
