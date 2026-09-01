import { createHash } from 'crypto';
import { PosDeviceService } from './pos-device.service';

function hashDeviceKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('PosDeviceService.verifyCredentials', () => {
  function setup(device: Record<string, unknown> | null) {
    const posDevice = {
      findUnique: jest.fn().mockResolvedValue(device),
      update: jest.fn().mockResolvedValue(device),
    };
    const service = new PosDeviceService(
      { posDevice } as never,
      { listStores: jest.fn().mockResolvedValue([]) },
      { resolveStoreStableIdByDbId: jest.fn().mockResolvedValue(null) },
    );
    return { service, posDevice };
  }

  it('accepts an ACTIVE device with matching credentials', async () => {
    const deviceKey = 'device-secret';
    const device = {
      id: 'db-device-1',
      deviceStableId: 'device-1',
      store: { storeStableId: 'store-a' },
      name: 'Front POS',
      status: 'ACTIVE',
      deviceKeyHash: hashDeviceKey(deviceKey),
    };
    const { service, posDevice } = setup(device);

    await expect(
      service.verifyCredentials({ deviceStableId: 'device-1', deviceKey }),
    ).resolves.toEqual({
      deviceStableId: 'device-1',
      storeStableId: 'store-a',
      name: 'Front POS',
    });
    expect(posDevice.findUnique).toHaveBeenCalledWith({
      where: { deviceStableId: 'device-1' },
      select: {
        id: true,
        deviceKeyHash: true,
        status: true,
        deviceStableId: true,
        name: true,
        store: { select: { storeStableId: true } },
      },
    });
    expect(posDevice.update).toHaveBeenCalledWith({
      where: { id: 'db-device-1' },
      data: { lastSeenAt: expect.any(Date) as unknown },
    });
  });

  it('rejects an ACTIVE device when the device key is invalid', async () => {
    const { service, posDevice } = setup({
      id: 'db-device-1',
      deviceStableId: 'device-1',
      status: 'ACTIVE',
      deviceKeyHash: hashDeviceKey('correct-secret'),
      meta: null,
    });

    await expect(
      service.verifyCredentials({
        deviceStableId: 'device-1',
        deviceKey: 'wrong-secret',
      }),
    ).resolves.toBeNull();
    expect(posDevice.update).not.toHaveBeenCalled();
  });

  it('rejects a DISABLED device even when the device key matches', async () => {
    const deviceKey = 'device-secret';
    const { service, posDevice } = setup({
      id: 'db-device-1',
      deviceStableId: 'device-1',
      status: 'DISABLED',
      deviceKeyHash: hashDeviceKey(deviceKey),
      meta: null,
    });

    await expect(
      service.verifyCredentials({ deviceStableId: 'device-1', deviceKey }),
    ).resolves.toBeNull();
    expect(posDevice.update).not.toHaveBeenCalled();
  });

  it('rejects a missing device without recording lastSeenAt', async () => {
    const { service, posDevice } = setup(null);

    await expect(
      service.verifyCredentials({
        deviceStableId: 'missing-device',
        deviceKey: 'device-secret',
      }),
    ).resolves.toBeNull();
    expect(posDevice.update).not.toHaveBeenCalled();
  });
});

describe('PosDeviceService management boundary', () => {
  const storeDbId = '8a3d4c0e-4750-4f6a-9138-000000000001';
  const storeStableId = '4750_Yonge_Street';
  const deviceDbId = '37bbde5d-b8d9-4e34-8c32-b4c0fdb37c25';
  const deviceStableId = 'cmdevice000000000000000001';
  const managedDevice = {
    deviceStableId,
    name: 'Front POS',
    status: 'ACTIVE' as const,
    enrolledAt: new Date('2026-08-31T12:00:00.000Z'),
    lastSeenAt: null,
    store: { storeStableId },
  };

  function setup() {
    const posDevice = {
      findMany: jest.fn().mockResolvedValue([managedDevice]),
      findUnique: jest.fn().mockResolvedValue(managedDevice),
      create: jest.fn().mockResolvedValue(managedDevice),
      update: jest.fn().mockResolvedValue(managedDevice),
      delete: jest.fn().mockResolvedValue(managedDevice),
    };
    const storeDirectoryReader = {
      listStores: jest.fn().mockResolvedValue([
        {
          storeStableId,
          storeName: '4750 Yonge St.',
          isActive: true,
        },
      ]),
    };
    const storeLegacyDbIdResolver = {
      resolveStoreStableIdByDbId: jest.fn().mockResolvedValue(storeStableId),
    };
    const service = new PosDeviceService(
      { posDevice } as never,
      storeDirectoryReader,
      storeLegacyDbIdResolver,
    );
    return {
      service,
      posDevice,
      storeDirectoryReader,
      storeLegacyDbIdResolver,
    };
  }

  it('lists a selected store through storeStableId and returns no database IDs', async () => {
    const { service, posDevice } = setup();

    await expect(service.listDevicesByStore(storeStableId)).resolves.toEqual([
      {
        deviceStableId,
        storeStableId,
        name: 'Front POS',
        status: 'ACTIVE',
        enrolledAt: managedDevice.enrolledAt,
        lastSeenAt: null,
      },
    ]);
    expect(posDevice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { store: { storeStableId } },
        select: expect.not.objectContaining({
          id: true,
          storeId: true,
        }) as unknown,
      }),
    );
  });

  it('creates a device by connecting Store through storeStableId', async () => {
    const { service, posDevice, storeDirectoryReader } = setup();

    const created = await service.createDevice({
      storeStableId,
      name: 'Front POS',
    });

    expect(storeDirectoryReader.listStores).toHaveBeenCalledTimes(1);
    expect(posDevice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Front POS',
          store: { connect: { storeStableId } },
        }) as unknown,
      }),
    );
    expect(created).toEqual(
      expect.objectContaining({
        deviceStableId,
        storeStableId,
        enrollmentCode: expect.any(String) as unknown,
      }),
    );
    expect(created).not.toHaveProperty('id');
    expect(created).not.toHaveProperty('storeId');
  });

  it('updates and deletes devices through deviceStableId', async () => {
    const { service, posDevice } = setup();

    await service.updateDeviceStatus(deviceStableId, 'DISABLED');
    await service.deleteDevice(deviceStableId);

    expect(posDevice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deviceStableId },
        data: { status: 'DISABLED' },
      }),
    );
    expect(posDevice.delete).toHaveBeenCalledWith({
      where: { deviceStableId },
    });
  });

  it('isolates legacy DB UUID translation behind compatibility methods', async () => {
    const { service, posDevice, storeLegacyDbIdResolver } = setup();
    posDevice.findUnique.mockResolvedValueOnce({ deviceStableId });

    await expect(service.resolveDeviceStableId(deviceDbId)).resolves.toBe(
      deviceStableId,
    );
    await expect(service.resolveStoreStableId(storeDbId)).resolves.toBe(
      storeStableId,
    );

    expect(posDevice.findUnique).toHaveBeenCalledWith({
      where: { id: deviceDbId },
      select: { deviceStableId: true },
    });
    expect(
      storeLegacyDbIdResolver.resolveStoreStableIdByDbId,
    ).toHaveBeenCalledWith(storeDbId);
  });
});
