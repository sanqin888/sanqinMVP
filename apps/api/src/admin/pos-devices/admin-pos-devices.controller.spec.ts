import { BadRequestException } from '@nestjs/common';
import { AdminPosDevicesController } from './admin-pos-devices.controller';

describe('AdminPosDevicesController stable identity adapter', () => {
  const storeStableId = '4750_Yonge_Street';
  const deviceStableId = 'cmdevice000000000000000001';
  const device = {
    deviceStableId,
    storeStableId,
    name: 'Front POS',
    status: 'ACTIVE' as const,
    enrolledAt: new Date('2026-08-31T12:00:00.000Z'),
    lastSeenAt: null,
  };

  function setup() {
    const management = {
      listDevicesByStore: jest.fn().mockResolvedValue([device]),
      createDevice: jest.fn().mockResolvedValue({
        ...device,
        enrollmentCode: 'A1B2C3D4',
      }),
      resetEnrollmentCode: jest.fn().mockResolvedValue({
        ...device,
        enrollmentCode: 'A1B2C3D4',
      }),
      updateDeviceStatus: jest.fn().mockResolvedValue(device),
      deleteDevice: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new AdminPosDevicesController(management);
    return { controller, management };
  }

  it('uses storeStableId directly for the canonical create path', async () => {
    const { controller, management } = setup();

    await controller.create({
      name: ' Front POS ',
      storeStableId: ` ${storeStableId} `,
    });

    expect(management.createDevice).toHaveBeenCalledWith({
      name: 'Front POS',
      storeStableId,
    });
  });

  it('rejects create when the canonical storeStableId is blank', async () => {
    const { controller, management } = setup();

    await expect(
      controller.create({ name: 'Front POS', storeStableId: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(management.createDevice).not.toHaveBeenCalled();
  });

  it('filters the canonical list by storeStableId without legacy aliases', async () => {
    const { controller, management } = setup();

    const result = await controller.findAll(` ${storeStableId} `);

    expect(management.listDevicesByStore).toHaveBeenCalledWith(storeStableId);
    expect(result).toEqual([device]);
    expect(result?.[0]).not.toHaveProperty('id');
    expect(result?.[0]).not.toHaveProperty('storeId');
  });

  it('rejects the retired unscoped list contract', async () => {
    const { controller, management } = setup();

    await expect(controller.findAll()).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(management.listDevicesByStore).not.toHaveBeenCalled();
  });

  it('passes deviceStableId directly for reset, status and delete', async () => {
    const { controller, management } = setup();

    await controller.resetEnrollmentCode(deviceStableId);
    await controller.updateStatus(deviceStableId, { status: 'DISABLED' });
    await controller.delete(deviceStableId);

    expect(management.resetEnrollmentCode).toHaveBeenCalledWith(deviceStableId);
    expect(management.updateDeviceStatus).toHaveBeenCalledWith(
      deviceStableId,
      'DISABLED',
    );
    expect(management.deleteDevice).toHaveBeenCalledWith(deviceStableId);
  });
});
