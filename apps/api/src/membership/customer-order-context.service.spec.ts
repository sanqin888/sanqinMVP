import { CustomerService } from './customer.service';

function createService() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    userAddress: {
      findFirst: jest.fn(),
    },
  };
  const service = new CustomerService(
    prisma as never,
    { issueProgramsForUser: jest.fn() } as never,
    { notifySubscriptionWelcome: jest.fn() } as never,
  );

  return { service, prisma };
}

describe('CustomerService order runtime context', () => {
  it('projects only verified customer contact and language by stable identity', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      userStableId: 'c1234567890abcdefghijklmn',
      email: ' MEMBER@EXAMPLE.COM ',
      emailVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
      phone: ' +1 416 555 0188 ',
      phoneVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
      language: 'ZH',
    });

    await expect(
      service.getOrderCustomerContext('c1234567890abcdefghijklmn'),
    ).resolves.toEqual({
      userStableId: 'c1234567890abcdefghijklmn',
      verifiedEmail: 'member@example.com',
      verifiedPhone: '+1 416 555 0188',
      language: 'ZH',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { userStableId: 'c1234567890abcdefghijklmn' },
      select: {
        userStableId: true,
        email: true,
        emailVerifiedAt: true,
        phone: true,
        phoneVerifiedAt: true,
        language: true,
      },
    });
  });

  it('does not expose unverified contact values', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      userStableId: 'c1234567890abcdefghijklmn',
      email: 'member@example.com',
      emailVerifiedAt: null,
      phone: '+14165550188',
      phoneVerifiedAt: null,
      language: 'EN',
    });

    await expect(
      service.getOrderCustomerContext('c1234567890abcdefghijklmn'),
    ).resolves.toEqual({
      userStableId: 'c1234567890abcdefghijklmn',
      verifiedEmail: null,
      verifiedPhone: null,
      language: 'EN',
    });
  });

  it('resolves a saved delivery address inside Customer without returning DB identities', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: '8a3d4c0e-4750-4f6a-9138-000000000001',
    });
    prisma.userAddress.findFirst.mockResolvedValue({
      addressStableId: 'a1234567890abcdefghijklmn',
      addressLine1: '4750 Yonge St',
      addressLine2: 'Unit 138',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M2N 5M6',
      placeId: 'place-1',
      latitude: 43.7601,
      longitude: -79.4118,
    });

    await expect(
      service.getSavedDeliveryAddress({
        userStableId: 'c1234567890abcdefghijklmn',
        addressStableId: 'a1234567890abcdefghijklmn',
      }),
    ).resolves.toEqual({
      addressStableId: 'a1234567890abcdefghijklmn',
      addressLine1: '4750 Yonge St',
      addressLine2: 'Unit 138',
      city: 'Toronto',
      province: 'ON',
      postalCode: 'M2N 5M6',
      placeId: 'place-1',
      latitude: 43.7601,
      longitude: -79.4118,
    });
    expect(prisma.userAddress.findFirst).toHaveBeenCalledWith({
      where: {
        userId: '8a3d4c0e-4750-4f6a-9138-000000000001',
        addressStableId: 'a1234567890abcdefghijklmn',
      },
      select: {
        addressStableId: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        province: true,
        postalCode: true,
        placeId: true,
        latitude: true,
        longitude: true,
      },
    });
  });
});
