import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { PosDevicesController } from './pos-devices.controller';

describe('PosDevicesController heartbeat', () => {
  it(
    'records the device heartbeat and returns a canonical-envelope-compatible success',
    async () => {
      const posDeviceService = {
        recordConnectivityHeartbeat: jest.fn().mockResolvedValue(undefined),
      };
      const controller = new PosDevicesController(posDeviceService as never);

      await expect(
        controller.heartbeat({
          posDevice: { deviceStableId: 'pos_device_1' },
        } as never),
      ).resolves.toEqual({ success: true });

      expect(posDeviceService.recordConnectivityHeartbeat).toHaveBeenCalledWith(
        'pos_device_1',
      );
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, controller.heartbeat),
      ).toBe(200);
    },
  );
});
