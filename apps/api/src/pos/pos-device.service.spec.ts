import { createHash } from 'crypto';
import { PosDeviceService } from './pos-device.service';

function hashDeviceKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('PosDeviceService.verifyDevice', () => {
  function setup(device: Record<string, unknown> | null) {
    const posDevice = {
      findUnique: jest.fn().mockResolvedValue(device),
      update: jest.fn().mockResolvedValue(device),
    };
    const service = new PosDeviceService({ posDevice } as never);
    return { service, posDevice };
  }

  it('accepts an ACTIVE device with matching credentials', async () => {
    const deviceKey = 'device-secret';
    const device = {
      id: 'db-device-1',
      deviceStableId: 'device-1',
      storeId: 'store-db-a',
      store: { storeStableId: 'store-a' },
      status: 'ACTIVE',
      deviceKeyHash: hashDeviceKey(deviceKey),
      meta: null,
    };
    const { service, posDevice } = setup(device);

    await expect(
      service.verifyDevice({ deviceStableId: 'device-1', deviceKey }),
    ).resolves.toEqual({
      id: 'db-device-1',
      deviceStableId: 'device-1',
      storeId: 'store-db-a',
      storeStableId: 'store-a',
      status: 'ACTIVE',
      deviceKeyHash: hashDeviceKey(deviceKey),
      meta: null,
    });
    expect(posDevice.findUnique).toHaveBeenCalledWith({
      where: { deviceStableId: 'device-1' },
      select: expect.objectContaining({
        storeId: true,
        store: { select: { storeStableId: true } },
      }) as unknown,
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
      storeId: 'store-a',
      status: 'ACTIVE',
      deviceKeyHash: hashDeviceKey('correct-secret'),
      meta: null,
    });

    await expect(
      service.verifyDevice({
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
      storeId: 'store-a',
      status: 'DISABLED',
      deviceKeyHash: hashDeviceKey(deviceKey),
      meta: null,
    });

    await expect(
      service.verifyDevice({ deviceStableId: 'device-1', deviceKey }),
    ).resolves.toBeNull();
    expect(posDevice.update).not.toHaveBeenCalled();
  });

  it('rejects a missing device without recording lastSeenAt', async () => {
    const { service, posDevice } = setup(null);

    await expect(
      service.verifyDevice({
        deviceStableId: 'missing-device',
        deviceKey: 'device-secret',
      }),
    ).resolves.toBeNull();
    expect(posDevice.update).not.toHaveBeenCalled();
  });
});
