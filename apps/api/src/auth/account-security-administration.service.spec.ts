import { AccountSecurityAdministrationError } from './account-security-administration.contract';
import { AccountSecurityAdministrationService } from './account-security-administration.service';

function createService() {
  const userFindUnique = jest.fn();
  const userUpdate = jest.fn();
  const userSessionFindMany = jest.fn();
  const userSessionFindFirst = jest.fn();
  const userSessionDeleteMany = jest.fn();
  const trustedDeviceFindMany = jest.fn();
  const trustedDeviceDeleteMany = jest.fn();
  const service = new AccountSecurityAdministrationService({
    user: {
      findUnique: userFindUnique,
      update: userUpdate,
    },
    userSession: {
      findMany: userSessionFindMany,
      findFirst: userSessionFindFirst,
      deleteMany: userSessionDeleteMany,
    },
    trustedDevice: {
      findMany: trustedDeviceFindMany,
      deleteMany: trustedDeviceDeleteMany,
    },
  } as never);

  return {
    service,
    userFindUnique,
    userUpdate,
    userSessionFindMany,
    userSessionFindFirst,
    userSessionDeleteMany,
    trustedDeviceFindMany,
    trustedDeviceDeleteMany,
  };
}

describe('AccountSecurityAdministrationService', () => {
  it('owns device management and exposes only the trusted-device stable identity', async () => {
    const {
      service,
      userFindUnique,
      userSessionFindMany,
      trustedDeviceFindMany,
    } = createService();
    userFindUnique.mockResolvedValue({ id: 'user-db-id' });
    userSessionFindMany.mockResolvedValue([
      {
        sessionId: 'session-new',
        createdAt: new Date('2026-09-05T10:00:00.000Z'),
        expiresAt: new Date('2026-10-05T10:00:00.000Z'),
        mfaVerifiedAt: null,
        deviceInfo: 'Chrome / Windows',
        loginLocation: 'Toronto',
      },
      {
        sessionId: 'session-current-older',
        createdAt: new Date('2026-09-04T10:00:00.000Z'),
        expiresAt: new Date('2026-10-04T10:00:00.000Z'),
        mfaVerifiedAt: new Date('2026-09-04T10:01:00.000Z'),
        deviceInfo: 'Chrome / Windows',
        loginLocation: 'Toronto',
      },
      {
        sessionId: 'session-phone',
        createdAt: new Date('2026-09-03T10:00:00.000Z'),
        expiresAt: new Date('2026-10-03T10:00:00.000Z'),
        mfaVerifiedAt: null,
        deviceInfo: 'Safari / iPhone',
        loginLocation: null,
      },
    ]);
    trustedDeviceFindMany.mockResolvedValue([
      {
        trustedDeviceStableId: 'trusted-device-stable-id',
        label: 'Chrome / Windows',
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
        lastSeenAt: new Date('2026-09-05T10:00:00.000Z'),
        expiresAt: new Date('2026-10-01T10:00:00.000Z'),
      },
    ]);

    const result = await service.getDeviceManagement(
      'user-stable-id',
      'session-current-older',
    );

    expect(userFindUnique).toHaveBeenCalledWith({
      where: { userStableId: 'user-stable-id' },
      select: { id: true },
    });
    expect(userSessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-db-id' }, take: 20 }),
    );
    expect(trustedDeviceFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-db-id' },
      orderBy: { createdAt: 'desc' },
      select: {
        trustedDeviceStableId: true,
        label: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
    });
    expect(result.sessions).toEqual([
      expect.objectContaining({
        sessionId: 'session-current-older',
        isCurrent: true,
      }),
      expect.objectContaining({
        sessionId: 'session-phone',
        isCurrent: false,
      }),
    ]);
    expect(result.trustedDevices).toEqual([
      expect.objectContaining({
        id: 'trusted-device-stable-id',
        trustedDeviceStableId: 'trusted-device-stable-id',
      }),
    ]);
  });

  it('scopes session revocation by stable user ownership', async () => {
    const { service, userFindUnique, userSessionDeleteMany } = createService();
    userFindUnique.mockResolvedValue({ id: 'user-db-id' });
    userSessionDeleteMany.mockResolvedValue({ count: 1 });

    await service.revokeSession('user-stable-id', 'session-id');

    expect(userSessionDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-db-id', sessionId: 'session-id' },
    });
  });

  it('revokes trusted devices by stable identity rather than the Prisma UUID', async () => {
    const { service, userFindUnique, trustedDeviceDeleteMany } = createService();
    userFindUnique.mockResolvedValue({ id: 'user-db-id' });
    trustedDeviceDeleteMany.mockResolvedValue({ count: 1 });

    await service.revokeTrustedDevice(
      'user-stable-id',
      'trusted-device-stable-id',
    );

    expect(trustedDeviceDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-db-id',
        trustedDeviceStableId: 'trusted-device-stable-id',
      },
    });
  });

  it('owns the session-derived device label used by the self-service trust flow', async () => {
    const { service, userFindUnique, userSessionFindFirst } = createService();
    userFindUnique.mockResolvedValue({ id: 'user-db-id' });
    userSessionFindFirst.mockResolvedValue({
      deviceInfo: 'Safari / iPhone',
      loginLocation: 'Toronto',
    });

    await expect(
      service.getSessionDeviceLabel('user-stable-id', 'session-id'),
    ).resolves.toEqual({ label: 'Safari / iPhone · Toronto' });
    expect(userSessionFindFirst).toHaveBeenCalledWith({
      where: { userId: 'user-db-id', sessionId: 'session-id' },
      select: { deviceInfo: true, loginLocation: true },
    });
  });

  it('preserves ACTIVE/DISABLED account status behavior', async () => {
    const { service, userFindUnique, userUpdate } = createService();
    userFindUnique.mockResolvedValue({
      userStableId: 'user-stable-id',
      status: 'ACTIVE',
    });
    userUpdate.mockResolvedValue({
      userStableId: 'user-stable-id',
      status: 'DISABLED',
    });

    await expect(
      service.setAccountStatus('user-stable-id', true),
    ).resolves.toEqual({
      userStableId: 'user-stable-id',
      status: 'DISABLED',
    });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { userStableId: 'user-stable-id' },
      data: { status: 'DISABLED' },
      select: { userStableId: true, status: true },
    });
  });

  it('returns owner errors for missing stable users and sessions', async () => {
    const { service, userFindUnique, userSessionFindFirst } = createService();
    userFindUnique.mockResolvedValueOnce(null);

    await expect(
      service.getDeviceManagement('missing-user'),
    ).rejects.toMatchObject({
      name: AccountSecurityAdministrationError.name,
      code: 'USER_NOT_FOUND',
    });

    userFindUnique.mockResolvedValueOnce({ id: 'user-db-id' });
    userSessionFindFirst.mockResolvedValueOnce(null);
    await expect(
      service.getSessionDeviceLabel('user-stable-id', 'missing-session'),
    ).rejects.toMatchObject({
      name: AccountSecurityAdministrationError.name,
      code: 'SESSION_NOT_FOUND',
    });
  });
});
