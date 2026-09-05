import { StaffAdministrationService } from './staff-administration.service';

describe('StaffAdministrationService', () => {
  const createService = () => {
    const prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      userInvite: {
        findMany: jest.fn(),
      },
    };
    const authService = {
      createStaffInvite: jest.fn(),
      resendStaffInvite: jest.fn(),
      revokeStaffInvite: jest.fn(),
    };
    const staffInviteDelivery = {
      sendStaffInvite: jest.fn(),
    };
    const service = new StaffAdministrationService(
      prisma as never,
      authService as never,
      staffInviteDelivery as never,
    );

    return { service, prisma, authService, staffInviteDelivery };
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lists only managed ADMIN/STAFF accounts and maps the latest session', async () => {
    const { service, prisma } = createService();
    const createdAt = new Date('2026-09-01T12:00:00.000Z');
    const lastLoginAt = new Date('2026-09-04T15:00:00.000Z');
    prisma.user.findMany.mockResolvedValue([
      {
        userStableId: 'admin-stable-id',
        email: 'admin@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
        createdAt,
        firstName: 'SanQ',
        lastName: 'Admin',
        sessions: [{ createdAt: lastLoginAt }],
      },
    ]);

    await expect(service.listStaff()).resolves.toEqual({
      staff: [
        {
          userStableId: 'admin-stable-id',
          email: 'admin@example.com',
          role: 'ADMIN',
          status: 'ACTIVE',
          createdAt,
          lastLoginAt,
          name: 'SanQ Admin',
        },
      ],
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: { in: ['ADMIN', 'STAFF'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
  });

  it('rejects modifying the current actor by stable identity', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'actor-db-id',
      userStableId: 'actor-stable-id',
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    await expect(
      service.updateStaff({
        actorUserStableId: 'actor-stable-id',
        targetUserStableId: 'actor-stable-id',
        role: 'STAFF',
      }),
    ).rejects.toMatchObject({
      code: 'CURRENT_USER_MODIFICATION',
      message: 'Cannot modify current user',
    });

    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('preserves the existing last-active-admin invariant before demotion', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'target-db-id',
      userStableId: 'target-stable-id',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    prisma.user.count.mockResolvedValue(1);

    await expect(
      service.updateStaff({
        actorUserStableId: 'actor-stable-id',
        targetUserStableId: 'target-stable-id',
        role: 'STAFF',
      }),
    ).rejects.toMatchObject({
      code: 'LAST_ACTIVE_ADMIN',
      message: 'Cannot modify last active admin',
    });

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { role: 'ADMIN', status: 'ACTIVE' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows an admin demotion when another active admin remains', async () => {
    const { service, prisma } = createService();
    const createdAt = new Date('2026-08-01T00:00:00.000Z');
    prisma.user.findUnique.mockResolvedValue({
      id: 'target-db-id',
      userStableId: 'target-stable-id',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    prisma.user.count.mockResolvedValue(2);
    prisma.user.update.mockResolvedValue({
      userStableId: 'target-stable-id',
      email: 'target@example.com',
      role: 'STAFF',
      status: 'ACTIVE',
      createdAt,
      firstName: 'Target',
      lastName: null,
      sessions: [],
    });

    await expect(
      service.updateStaff({
        actorUserStableId: 'actor-stable-id',
        targetUserStableId: 'target-stable-id',
        role: 'STAFF',
      }),
    ).resolves.toEqual({
      userStableId: 'target-stable-id',
      email: 'target@example.com',
      role: 'STAFF',
      status: 'ACTIVE',
      createdAt,
      lastLoginAt: null,
      name: 'Target',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'target-db-id' },
      data: { role: 'STAFF', status: 'ACTIVE' },
      include: {
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
  });

  it('creates and delivers an invite from a stable inviter identity', async () => {
    jest
      .useFakeTimers()
      .setSystemTime(new Date('2026-09-05T00:00:00.000Z'));
    const { service, prisma, authService, staffInviteDelivery } =
      createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'inviter-db-id',
      firstName: 'Store',
      lastName: 'Owner',
    });
    const invite = {
      inviteStableId: 'invite-stable-id',
      email: 'staff@example.com',
      role: 'STAFF',
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
      expiresAt: new Date('2026-09-12T00:00:00.000Z'),
      usedAt: null,
      revokedAt: null,
      sentCount: 1,
      lastSentAt: new Date('2026-09-05T00:00:00.000Z'),
      invitedBy: { userStableId: 'inviter-stable-id' },
    };
    authService.createStaffInvite.mockResolvedValue({
      invite,
      token: 'invite-token',
    });
    staffInviteDelivery.sendStaffInvite.mockResolvedValue({
      ok: true,
      sendId: 'send-id',
    });

    await expect(
      service.createInvite({
        inviterUserStableId: 'inviter-stable-id',
        email: 'staff@example.com',
        role: 'STAFF',
        locale: 'en',
      }),
    ).resolves.toEqual({
      invite: {
        inviteStableId: 'invite-stable-id',
        email: 'staff@example.com',
        roleToGrant: 'STAFF',
        status: 'PENDING',
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        acceptedAt: null,
        sentCount: 1,
        lastSentAt: invite.lastSentAt,
        invitedByUserStableId: 'inviter-stable-id',
      },
      token: 'invite-token',
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { userStableId: 'inviter-stable-id' },
      select: { id: true, firstName: true, lastName: true },
    });
    expect(authService.createStaffInvite).toHaveBeenCalledWith({
      inviterId: 'inviter-db-id',
      email: 'staff@example.com',
      role: 'STAFF',
    });
    expect(staffInviteDelivery.sendStaffInvite).toHaveBeenCalledWith({
      to: 'staff@example.com',
      token: 'invite-token',
      role: 'STAFF',
      inviterName: 'Store Owner',
      locale: 'en',
    });
  });

  it('preserves the existing backend ACCOUNTANT invite capability', async () => {
    const { service, prisma, authService, staffInviteDelivery } =
      createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'inviter-db-id',
      firstName: 'Store',
      lastName: 'Owner',
    });
    const invite = {
      inviteStableId: 'accountant-invite-stable-id',
      email: 'accountant@example.com',
      role: 'ACCOUNTANT',
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
      expiresAt: new Date('2099-09-12T00:00:00.000Z'),
      usedAt: null,
      revokedAt: null,
      sentCount: 1,
      lastSentAt: new Date('2026-09-05T00:00:00.000Z'),
      invitedBy: { userStableId: 'inviter-stable-id' },
    };
    authService.createStaffInvite.mockResolvedValue({
      invite,
      token: 'accountant-invite-token',
    });
    staffInviteDelivery.sendStaffInvite.mockResolvedValue({
      ok: true,
      sendId: 'send-id',
    });

    const result = await service.createInvite({
      inviterUserStableId: 'inviter-stable-id',
      email: 'accountant@example.com',
      role: 'ACCOUNTANT',
      locale: 'en',
    });

    expect(authService.createStaffInvite).toHaveBeenCalledWith({
      inviterId: 'inviter-db-id',
      email: 'accountant@example.com',
      role: 'ACCOUNTANT',
    });
    expect(result.invite.roleToGrant).toBe('ACCOUNTANT');
  });

  it('maps invite status inside the Identity owner', async () => {
    const { service, prisma } = createService();
    const revokedAt = new Date('2026-09-05T01:00:00.000Z');
    prisma.userInvite.findMany.mockResolvedValue([
      {
        inviteStableId: 'invite-stable-id',
        email: 'staff@example.com',
        role: 'STAFF',
        createdAt: new Date('2026-09-04T00:00:00.000Z'),
        expiresAt: new Date('2026-09-11T00:00:00.000Z'),
        usedAt: null,
        revokedAt,
        sentCount: 1,
        lastSentAt: null,
        invitedBy: { userStableId: 'inviter-stable-id' },
      },
    ]);

    const result = await service.listInvites();

    expect(result.invites[0]?.status).toBe('REVOKED');
    expect(result.invites[0]?.invitedByUserStableId).toBe('inviter-stable-id');
  });

  it('resends through the existing Auth invite lifecycle before Messaging delivery', async () => {
    const { service, authService, staffInviteDelivery } = createService();
    const invite = {
      inviteStableId: 'invite-stable-id',
      email: 'staff@example.com',
      role: 'STAFF',
      createdAt: new Date('2026-09-04T00:00:00.000Z'),
      expiresAt: new Date('2099-09-11T00:00:00.000Z'),
      usedAt: null,
      revokedAt: null,
      sentCount: 2,
      lastSentAt: new Date('2026-09-05T01:00:00.000Z'),
      invitedBy: { userStableId: 'inviter-stable-id' },
    };
    authService.resendStaffInvite.mockResolvedValue({
      invite,
      token: 'resend-token',
    });
    staffInviteDelivery.sendStaffInvite.mockResolvedValue({
      ok: true,
      sendId: 'send-id',
    });

    const result = await service.resendInvite('invite-stable-id', 'zh');

    expect(result.token).toBe('resend-token');
    expect(authService.resendStaffInvite).toHaveBeenCalledWith(
      'invite-stable-id',
    );
    expect(staffInviteDelivery.sendStaffInvite).toHaveBeenCalledWith({
      to: 'staff@example.com',
      token: 'resend-token',
      role: 'STAFF',
      locale: 'zh',
    });
  });

  it('keeps invite revoke mapping inside the Identity owner', async () => {
    const { service, authService } = createService();
    const revokedAt = new Date('2026-09-05T01:00:00.000Z');
    authService.revokeStaffInvite.mockResolvedValue({
      inviteStableId: 'invite-stable-id',
      email: 'staff@example.com',
      role: 'STAFF',
      createdAt: new Date('2026-09-04T00:00:00.000Z'),
      expiresAt: new Date('2026-09-11T00:00:00.000Z'),
      usedAt: null,
      revokedAt,
      sentCount: 1,
      lastSentAt: null,
      invitedBy: null,
    });

    const result = await service.revokeInvite('invite-stable-id');

    expect(result.inviteStableId).toBe('invite-stable-id');
    expect(result.status).toBe('REVOKED');
  });
});
