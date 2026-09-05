import { AccountSecurityAdministrationError } from './account-security-administration.contract';
import { AccountSecurityAdministrationService } from './account-security-administration.service';

function createService() {
  const userFindUnique = jest.fn();
  const userUpdate = jest.fn();
  const userSessionFindMany = jest.fn();
  const userSessionDeleteMany = jest.fn();
  const service = new AccountSecurityAdministrationService({
    user: {
      findUnique: userFindUnique,
      update: userUpdate,
    },
    userSession: {
      findMany: userSessionFindMany,
      deleteMany: userSessionDeleteMany,
    },
  } as never);

  return {
    service,
    userFindUnique,
    userUpdate,
    userSessionFindMany,
    userSessionDeleteMany,
  };
}

describe('AccountSecurityAdministrationService', () => {
  it('resolves the stable user identity inside Auth and preserves admin session projection', async () => {
    const { service, userFindUnique, userSessionFindMany } = createService();
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
        sessionId: 'session-old-same-device',
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

    const result = await service.listSessions('user-stable-id');

    expect(userFindUnique).toHaveBeenCalledWith({
      where: { userStableId: 'user-stable-id' },
      select: { id: true },
    });
    expect(userSessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-db-id' }, take: 20 }),
    );
    expect(result.sessions).toEqual([
      expect.objectContaining({
        sessionId: 'session-new',
        isCurrent: false,
      }),
      expect.objectContaining({
        sessionId: 'session-phone',
        isCurrent: false,
      }),
    ]);
  });

  it('scopes admin session revocation by stable user ownership', async () => {
    const { service, userFindUnique, userSessionDeleteMany } = createService();
    userFindUnique.mockResolvedValue({ id: 'user-db-id' });
    userSessionDeleteMany.mockResolvedValue({ count: 1 });

    await service.revokeSession('user-stable-id', 'session-id');

    expect(userSessionDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-db-id', sessionId: 'session-id' },
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

  it('returns an owner error when the stable user identity does not exist', async () => {
    const { service, userFindUnique } = createService();
    userFindUnique.mockResolvedValue(null);

    await expect(service.listSessions('missing-user')).rejects.toMatchObject({
      name: AccountSecurityAdministrationError.name,
      code: 'USER_NOT_FOUND',
    });
  });
});
