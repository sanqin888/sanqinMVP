import { createHash } from 'crypto';
import { PosDeviceService } from './pos-device.service';

function hashDeviceKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('PosDeviceService.verifyCredentials', () => {
  function setup(device: Record<string, unknown> | null) {
    const posDevice = {
      findUnique: jest.fn().mockResolvedValue(device),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(device),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const posConnectivityReadModel = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const service = new PosDeviceService(
      { posDevice, posConnectivityReadModel } as never,
      {
        listStores: jest.fn().mockResolvedValue([]),
      },
    );
    return { service, posDevice, posConnectivityReadModel };
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
        meta: true,
        store: { select: { storeStableId: true } },
      },
    });
    expect(posDevice.updateMany).toHaveBeenCalledWith({
      where: { id: 'db-device-1', status: 'ACTIVE' },
      data: { lastSeenAt: expect.any(Date) as unknown },
    });
  });

  it('refreshes the POS-owned connectivity read model for heartbeat-capable activity', async () => {
    const originalTimeout = process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS;
    const now = new Date('2026-09-09T17:30:00.000Z');
    process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS = '90000';
    jest.useFakeTimers().setSystemTime(now);
    try {
      const deviceKey = 'device-secret';
      const { service, posConnectivityReadModel } = setup({
        id: 'db-device-1',
        deviceStableId: 'device-1',
        store: { storeStableId: 'store-a' },
        name: 'Front POS',
        status: 'ACTIVE',
        deviceKeyHash: hashDeviceKey(deviceKey),
        meta: { connectivityHeartbeatV1: true },
      });
      const validUntil = new Date(now.getTime() + 90_000);

      await service.verifyCredentials({
        deviceStableId: 'device-1',
        deviceKey,
      });

      expect(posConnectivityReadModel.updateMany).toHaveBeenCalledWith({
        where: {
          storeStableId: 'store-a',
          OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: now } }],
        },
        data: {
          hasHeartbeatCapableActiveDevice: true,
          lastHeartbeatAt: now,
          validUntil,
        },
      });
      expect(posConnectivityReadModel.createMany).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
      if (originalTimeout === undefined)
        delete process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS;
      else process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS = originalTimeout;
    }
  });

  it('never lets an older authenticated activity overwrite a newer projection lease', async () => {
    const originalTimeout = process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS;
    process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS = '90000';
    const now = new Date('2026-09-09T17:30:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    try {
      const deviceKey = 'device-secret';
      const { service, posConnectivityReadModel } = setup({
        id: 'db-device-1',
        deviceStableId: 'device-1',
        store: { storeStableId: 'store-a' },
        name: 'Front POS',
        status: 'ACTIVE',
        deviceKeyHash: hashDeviceKey(deviceKey),
        meta: { connectivityHeartbeatV1: true },
      });
      posConnectivityReadModel.updateMany.mockResolvedValue({ count: 0 });
      posConnectivityReadModel.createMany.mockResolvedValue({ count: 0 });

      await service.verifyCredentials({
        deviceStableId: 'device-1',
        deviceKey,
      });

      const expectedMonotonicAdvance = {
        where: {
          storeStableId: 'store-a',
          OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: now } }],
        },
        data: {
          hasHeartbeatCapableActiveDevice: true,
          lastHeartbeatAt: now,
          validUntil: new Date(now.getTime() + 90_000),
        },
      };
      expect(posConnectivityReadModel.updateMany).toHaveBeenCalledTimes(2);
      expect(posConnectivityReadModel.updateMany).toHaveBeenNthCalledWith(
        1,
        expectedMonotonicAdvance,
      );
      expect(posConnectivityReadModel.updateMany).toHaveBeenNthCalledWith(
        2,
        expectedMonotonicAdvance,
      );
      expect(posConnectivityReadModel.createMany).toHaveBeenCalledWith({
        data: [
          {
            storeStableId: 'store-a',
            hasHeartbeatCapableActiveDevice: true,
            lastHeartbeatAt: now,
            validUntil: new Date(now.getTime() + 90_000),
          },
        ],
        skipDuplicates: true,
      });
      expect(posConnectivityReadModel.upsert).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
      if (originalTimeout === undefined)
        delete process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS;
      else process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS = originalTimeout;
    }
  });

  it('does not refresh connectivity after a device is concurrently disabled', async () => {
    const deviceKey = 'device-secret';
    const { service, posDevice, posConnectivityReadModel } = setup({
      id: 'db-device-1',
      deviceStableId: 'device-1',
      store: { storeStableId: 'store-a' },
      name: 'Front POS',
      status: 'ACTIVE',
      deviceKeyHash: hashDeviceKey(deviceKey),
      meta: { connectivityHeartbeatV1: true },
    });
    posDevice.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.verifyCredentials({ deviceStableId: 'device-1', deviceKey }),
    ).resolves.toBeNull();
    expect(posConnectivityReadModel.updateMany).not.toHaveBeenCalled();
    expect(posConnectivityReadModel.createMany).not.toHaveBeenCalled();
  });

  it('repairs the projection if a heartbeat-capable device becomes inactive after activity is recorded', async () => {
    const deviceKey = 'device-secret';
    const device = {
      id: 'db-device-1',
      deviceStableId: 'device-1',
      store: { storeStableId: 'store-a' },
      name: 'Front POS',
      status: 'ACTIVE',
      deviceKeyHash: hashDeviceKey(deviceKey),
      meta: { connectivityHeartbeatV1: true },
    };
    const { service, posDevice, posConnectivityReadModel } = setup(device);
    posDevice.findUnique
      .mockResolvedValueOnce(device)
      .mockResolvedValueOnce({ status: 'DISABLED' });

    await expect(
      service.verifyCredentials({ deviceStableId: 'device-1', deviceKey }),
    ).resolves.toBeNull();

    expect(posDevice.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', store: { storeStableId: 'store-a' } },
      select: { lastSeenAt: true, meta: true },
    });
    expect(posConnectivityReadModel.upsert).toHaveBeenCalledWith({
      where: { storeStableId: 'store-a' },
      create: {
        storeStableId: 'store-a',
        hasHeartbeatCapableActiveDevice: false,
        lastHeartbeatAt: null,
        validUntil: null,
      },
      update: {
        hasHeartbeatCapableActiveDevice: false,
        lastHeartbeatAt: null,
        validUntil: null,
      },
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
    expect(posDevice.updateMany).not.toHaveBeenCalled();
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
    expect(posDevice.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a missing device without recording lastSeenAt', async () => {
    const { service, posDevice } = setup(null);

    await expect(
      service.verifyCredentials({
        deviceStableId: 'missing-device',
        deviceKey: 'device-secret',
      }),
    ).resolves.toBeNull();
    expect(posDevice.updateMany).not.toHaveBeenCalled();
  });
});

describe('PosDeviceService connectivity projection', () => {
  it('repairs the POS-owned read model to UNKNOWN when no heartbeat-capable ACTIVE device remains', async () => {
    const posDevice = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    const posConnectivityReadModel = {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const service = new PosDeviceService(
      { posDevice, posConnectivityReadModel } as never,
      { listStores: jest.fn().mockResolvedValue([]) },
    );

    await service.repairConnectivityReadModelForStore('store-a');

    expect(posConnectivityReadModel.upsert).toHaveBeenCalledWith({
      where: { storeStableId: 'store-a' },
      create: {
        storeStableId: 'store-a',
        hasHeartbeatCapableActiveDevice: false,
        lastHeartbeatAt: null,
        validUntil: null,
      },
      update: {
        hasHeartbeatCapableActiveDevice: false,
        lastHeartbeatAt: null,
        validUntil: null,
      },
    });
  });

  it('repairs an active heartbeat projection without regressing a newer lease', async () => {
    const originalTimeout = process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS;
    process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS = '90000';
    try {
      const heartbeatAt = new Date('2026-09-09T17:30:00.000Z');
      const posDevice = {
        findMany: jest.fn().mockResolvedValue([
          {
            lastSeenAt: heartbeatAt,
            meta: { connectivityHeartbeatV1: true },
          },
        ]),
      };
      const posConnectivityReadModel = {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
      };
      const service = new PosDeviceService(
        { posDevice, posConnectivityReadModel } as never,
        { listStores: jest.fn().mockResolvedValue([]) },
      );

      await service.repairConnectivityReadModelForStore('store-a');

      expect(posConnectivityReadModel.updateMany).toHaveBeenCalledTimes(2);
      expect(posConnectivityReadModel.updateMany).toHaveBeenNthCalledWith(1, {
        where: {
          storeStableId: 'store-a',
          OR: [
            { lastHeartbeatAt: null },
            { lastHeartbeatAt: { lt: heartbeatAt } },
          ],
        },
        data: {
          hasHeartbeatCapableActiveDevice: true,
          lastHeartbeatAt: heartbeatAt,
          validUntil: new Date(heartbeatAt.getTime() + 90_000),
        },
      });
      expect(posConnectivityReadModel.upsert).not.toHaveBeenCalled();
    } finally {
      if (originalTimeout === undefined)
        delete process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS;
      else process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS = originalTimeout;
    }
  });

  it('seeds the POS-owned read model when heartbeat capability is first enabled', async () => {
    const originalTimeout = process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS;
    process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS = '90000';
    try {
      const lastSeenAt = new Date('2026-09-09T17:30:00.000Z');
      const posDevice = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'db-device-1',
          meta: {},
          store: { storeStableId: 'store-a' },
        }),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([
          {
            lastSeenAt,
            meta: { connectivityHeartbeatV1: true },
          },
        ]),
      };
      const posConnectivityReadModel = {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
      };
      const service = new PosDeviceService(
        { posDevice, posConnectivityReadModel } as never,
        { listStores: jest.fn().mockResolvedValue([]) },
      );

      await service.recordConnectivityHeartbeat('device-1');

      expect(posDevice.update).toHaveBeenCalledWith({
        where: { id: 'db-device-1' },
        data: {
          meta: expect.objectContaining({
            connectivityHeartbeatV1: true,
          }) as unknown,
        },
      });
      expect(posDevice.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE', store: { storeStableId: 'store-a' } },
        select: { lastSeenAt: true, meta: true },
      });
      expect(posConnectivityReadModel.upsert).toHaveBeenCalledTimes(1);
    } finally {
      if (originalTimeout === undefined)
        delete process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS;
      else process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS = originalTimeout;
    }
  });
});

describe('PosDeviceService management boundary', () => {
  const storeStableId = '4750_Yonge_Street';
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
    const posConnectivityReadModel = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
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
    const service = new PosDeviceService(
      { posDevice, posConnectivityReadModel } as never,
      storeDirectoryReader,
    );
    return {
      service,
      posDevice,
      posConnectivityReadModel,
      storeDirectoryReader,
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
});
