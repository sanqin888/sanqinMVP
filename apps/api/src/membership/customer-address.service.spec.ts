import { NotFoundException } from '@nestjs/common';
import { CustomerService } from './customer.service';

const baseAddress = {
  addressStableId: 'a-address-stable-1',
  label: 'Home',
  receiver: 'San Qin',
  phone: null,
  addressLine1: '4750 Yonge St',
  addressLine2: null,
  remark: null,
  city: 'Toronto',
  province: 'ON',
  postalCode: 'M2N 5M6',
  placeId: null,
  latitude: null,
  longitude: null,
  isDefault: true,
};

function createService(prisma: Record<string, unknown>) {
  return new CustomerService(
    prisma as never,
    { issueProgramsForUser: jest.fn() } as never,
    { notifySubscriptionWelcome: jest.fn() } as never,
  );
}

describe('CustomerService addresses', () => {
  it('makes the first address default and normalizes incomplete coordinates', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const create = jest
      .fn()
      .mockImplementation((input: { data: Record<string, unknown> }) => ({
        ...baseAddress,
        ...input.data,
      }));
    const tx = { userAddress: { updateMany, create } };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-db-id' }),
      },
      userAddress: {
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = createService(prisma);

    const result = await service.createAddress({
      userStableId: 'customer-stable-1',
      label: ' Home ',
      receiver: ' San Qin ',
      addressLine1: ' 4750 Yonge St ',
      city: ' Toronto ',
      province: ' ON ',
      postalCode: ' M2N 5M6 ',
      latitude: 43.0,
      longitude: null,
      isDefault: false,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-db-id' },
      data: { isDefault: false },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-db-id',
        addressStableId: expect.stringMatching(/^a/),
        label: 'Home',
        receiver: 'San Qin',
        addressLine1: '4750 Yonge St',
        city: 'Toronto',
        province: 'ON',
        postalCode: 'M2N 5M6',
        isDefault: true,
        latitude: null,
        longitude: null,
      }),
    });
    expect(result.isDefault).toBe(true);
  });

  it('rejects an address stable id that does not belong to the customer', async () => {
    const transaction = jest.fn();
    const service = createService({
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-db-id' }),
      },
      userAddress: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: transaction,
    });

    await expect(
      service.setDefaultAddress({
        userStableId: 'customer-stable-1',
        addressStableId: 'a-other-customer',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('promotes the newest remaining address after deleting the default', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-db-id' }),
      },
      userAddress: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'address-db-id-1',
            addressStableId: 'a-address-stable-1',
            userId: 'user-db-id',
            isDefault: true,
          })
          .mockResolvedValueOnce({ id: 'address-db-id-2' }),
        delete: jest.fn().mockResolvedValue(undefined),
        update,
      },
    });

    await expect(
      service.deleteAddress({
        userStableId: 'customer-stable-1',
        addressStableId: 'a-address-stable-1',
      }),
    ).resolves.toEqual({ success: true });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'address-db-id-2' },
      data: { isDefault: true },
    });
  });
});
