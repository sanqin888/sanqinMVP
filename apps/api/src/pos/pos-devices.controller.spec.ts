import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { PosDevicesController } from './pos-devices.controller';

describe('PosDevicesController heartbeat', () => {
  it('records the device heartbeat and returns a canonical-envelope-compatible success', async () => {
    const posDeviceService = {
      recordConnectivityHeartbeat: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new PosDevicesController(posDeviceService as never);

    await expect(
      controller.heartbeat({
        posDevice: {
          deviceStableId: 'pos_device_1',
          storeStableId: '4750_Yonge_Street',
          name: 'Front POS',
        },
      } as never),
    ).resolves.toEqual({ success: true });

    expect(posDeviceService.recordConnectivityHeartbeat).toHaveBeenCalledWith(
      'pos_device_1',
    );

    const heartbeatHandler = Object.getOwnPropertyDescriptor(
      PosDevicesController.prototype,
      'heartbeat',
    )?.value as unknown;
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, heartbeatHandler)).toBe(200);
  });
});
