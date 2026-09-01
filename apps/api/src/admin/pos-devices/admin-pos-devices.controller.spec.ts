import { AdminPosDevicesController } from './admin-pos-devices.controller';

describe('AdminPosDevicesController stable identity adapter', () => {
  const storeStableId = '4750_Yonge_Street';
  const deviceStableId = 'cmdevice000000000000000001';
  const deviceDbId = '37bbde5d-b8d9-4e34-8c32-b4c0fdb37c25';
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
    const compatibility = {
      listDevices: jest.fn().mockResolvedValue([device]),
      resolveStoreStableId: jest.fn().mockResolvedValue(storeStableId),
      resolveDeviceStableId: jest.fn().mockResolvedValue(deviceStableId),
    };
    const controller = new AdminPosDevicesController(management, compatibility);
    return { controller, management, compatibility };
  }

  it('uses storeStableId directly for the canonical create path', async () => {
    const { controller, management, compatibility } = setup();

    await controller.create({
      name: ' Front POS ',
      storeStableId,
    });

    expect(management.createDevice).toHaveBeenCalledWith({
      name: 'Front POS',
      storeStableId,
    });
    expect(compatibility.resolveStoreStableId).not.toHaveBeenCalled();
  });

  it('translates a legacy create Store UUID before canonical creation', async () => {
    const storeDbId = '8a3d4c0e-4750-4f6a-9138-000000000001';
    const { controller, management, compatibility } = setup();

    await controller.create({
      name: 'Legacy POS',
      storeId: storeDbId,
    });

    expect(compatibility.resolveStoreStableId).toHaveBeenCalledWith(storeDbId);
    expect(management.createDevice).toHaveBeenCalledWith({
      name: 'Legacy POS',
      storeStableId,
    });
  });

  it('filters the canonical list by storeStableId without legacy aliases', async () => {
    const { controller, management } = setup();

    const result = await controller.findAll(storeStableId);

    expect(management.listDevicesByStore).toHaveBeenCalledWith(storeStableId);
    expect(result).toEqual([device]);
    expect(result?.[0]).not.toHaveProperty('id');
    expect(result?.[0]).not.toHaveProperty('storeId');
  });

  it('keeps legacy list field names functional without returning DB UUIDs', async () => {
    const { controller } = setup();

    const result = await controller.findAll();

    expect(result).toEqual([
      {
        ...device,
        id: deviceStableId,
        storeId: storeStableId,
      },
    ]);
  });

  it('translates a stale browser device DB UUID before reset', async () => {
    const { controller, management, compatibility } = setup();

    await controller.resetEnrollmentCode(deviceDbId);

    expect(compatibility.resolveDeviceStableId).toHaveBeenCalledWith(
      deviceDbId,
    );
    expect(management.resetEnrollmentCode).toHaveBeenCalledWith(deviceStableId);
  });

  it('passes canonical deviceStableId directly without compatibility lookup', async () => {
    const { controller, management, compatibility } = setup();

    await controller.updateStatus(deviceStableId, { status: 'DISABLED' });

    expect(compatibility.resolveDeviceStableId).not.toHaveBeenCalled();
    expect(management.updateDeviceStatus).toHaveBeenCalledWith(
      deviceStableId,
      'DISABLED',
    );
  });
});
