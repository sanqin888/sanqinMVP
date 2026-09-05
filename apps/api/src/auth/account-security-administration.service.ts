import { PrismaService } from './identity-prisma';
import {
  AccountSecurityAdministrationError,
  type AccountDeviceManagementDto,
  type AccountSecurityAdministrationPort,
  type AccountSessionDto,
  type ManagedAccountStatus,
} from './account-security-administration.contract';

export class AccountSecurityAdministrationService implements AccountSecurityAdministrationPort {
  constructor(private readonly prisma: PrismaService) {}

  private async requireUserDbId(userStableId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { userStableId },
      select: { id: true },
    });
    if (!user) {
      throw new AccountSecurityAdministrationError(
        'USER_NOT_FOUND',
        'member not found',
      );
    }
    return user.id;
  }

  async getDeviceManagement(
    userStableId: string,
    currentSessionId?: string,
  ): Promise<AccountDeviceManagementDto> {
    const userDbId = await this.requireUserDbId(userStableId);
    const [sessions, trustedDevices] = await Promise.all([
      this.prisma.userSession.findMany({
        where: { userId: userDbId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          sessionId: true,
          createdAt: true,
          expiresAt: true,
          mfaVerifiedAt: true,
          deviceInfo: true,
          loginLocation: true,
        },
      }),
      this.prisma.trustedDevice.findMany({
        where: { userId: userDbId },
        orderBy: { createdAt: 'desc' },
        select: {
          trustedDeviceStableId: true,
          label: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
        },
      }),
    ]);

    const sessionItems: AccountSessionDto[] = sessions.map((session) => ({
      sessionId: session.sessionId,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      mfaVerifiedAt: session.mfaVerifiedAt?.toISOString() ?? null,
      deviceInfo: session.deviceInfo ?? null,
      loginLocation: session.loginLocation ?? null,
      isCurrent: session.sessionId === currentSessionId,
    }));

    const dedupedSessions: AccountSessionDto[] = [];
    const sessionIndexByDevice = new Map<string, number>();
    for (const session of sessionItems) {
      const key = session.deviceInfo
        ? `device:${session.deviceInfo}|${session.loginLocation ?? ''}`
        : `session:${session.sessionId}`;
      const existingIndex = sessionIndexByDevice.get(key);
      if (existingIndex === undefined) {
        sessionIndexByDevice.set(key, dedupedSessions.length);
        dedupedSessions.push(session);
        continue;
      }
      if (session.isCurrent && !dedupedSessions[existingIndex]?.isCurrent) {
        dedupedSessions[existingIndex] = session;
      }
    }

    return {
      sessions: dedupedSessions,
      trustedDevices: trustedDevices.map((device) => ({
        id: device.trustedDeviceStableId,
        trustedDeviceStableId: device.trustedDeviceStableId,
        label: device.label ?? null,
        createdAt: device.createdAt.toISOString(),
        lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
        expiresAt: device.expiresAt.toISOString(),
      })),
    };
  }

  async revokeSession(userStableId: string, sessionId: string): Promise<void> {
    const userDbId = await this.requireUserDbId(userStableId);
    await this.prisma.userSession.deleteMany({
      where: { userId: userDbId, sessionId },
    });
  }

  async revokeTrustedDevice(
    userStableId: string,
    trustedDeviceStableId: string,
  ): Promise<void> {
    const userDbId = await this.requireUserDbId(userStableId);
    await this.prisma.trustedDevice.deleteMany({
      where: { userId: userDbId, trustedDeviceStableId },
    });
  }

  async getSessionDeviceLabel(userStableId: string, sessionId: string) {
    const userDbId = await this.requireUserDbId(userStableId);
    const session = await this.prisma.userSession.findFirst({
      where: { userId: userDbId, sessionId },
      select: { deviceInfo: true, loginLocation: true },
    });
    if (!session) {
      throw new AccountSecurityAdministrationError(
        'SESSION_NOT_FOUND',
        'session not found',
      );
    }

    const parts = [session.deviceInfo, session.loginLocation].filter(
      (segment): segment is string => !!segment,
    );
    const label = parts.join(' · ').trim();
    return { label: label || undefined };
  }

  async setAccountStatus(userStableId: string, disabled: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { userStableId },
      select: { userStableId: true, status: true },
    });
    if (!user) {
      throw new AccountSecurityAdministrationError(
        'USER_NOT_FOUND',
        'member not found',
      );
    }

    const status: ManagedAccountStatus = disabled ? 'DISABLED' : 'ACTIVE';
    if (user.status === status) {
      return { userStableId: user.userStableId, status };
    }

    return this.prisma.user.update({
      where: { userStableId },
      data: { status },
      select: { userStableId: true, status: true },
    });
  }
}
