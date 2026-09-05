import { PrismaService } from './identity-prisma';
import {
  AccountSecurityAdministrationError,
  type AccountSecurityAdministrationPort,
  type AccountSessionDto,
} from './account-security-administration.contract';

export class AccountSecurityAdministrationService
  implements AccountSecurityAdministrationPort
{
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

  async listSessions(
    userStableId: string,
  ): Promise<{ sessions: AccountSessionDto[] }> {
    const userDbId = await this.requireUserDbId(userStableId);
    const sessions = await this.prisma.userSession.findMany({
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
    });

    const sessionItems: AccountSessionDto[] = sessions.map((session) => ({
      sessionId: session.sessionId,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      mfaVerifiedAt: session.mfaVerifiedAt?.toISOString() ?? null,
      deviceInfo: session.deviceInfo ?? null,
      loginLocation: session.loginLocation ?? null,
      isCurrent: false,
    }));

    const seen = new Map<string, AccountSessionDto>();
    const order: string[] = [];
    for (const session of sessionItems) {
      const key = session.deviceInfo
        ? `device:${session.deviceInfo}|${session.loginLocation ?? ''}`
        : `session:${session.sessionId}`;
      if (!seen.has(key)) {
        seen.set(key, session);
        order.push(key);
      }
    }

    return { sessions: order.map((key) => seen.get(key)!) };
  }

  async revokeSession(userStableId: string, sessionId: string): Promise<void> {
    const userDbId = await this.requireUserDbId(userStableId);
    await this.prisma.userSession.deleteMany({
      where: { userId: userDbId, sessionId },
    });
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

    const status = disabled ? 'DISABLED' : 'ACTIVE';
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
