import type { StaffInviteDeliveryPort } from '../email/public-api';
import { AuthService } from './auth.service';
import {
  type CreateStaffInviteInput,
  type ManagedStaffRole,
  type StaffAccountRole,
  StaffAdministrationError,
  type StaffAdministrationPort,
  type StaffInviteDto,
  type StaffInviteStatus,
  type StaffUserDto,
  type UpdateStaffInput,
} from './staff-administration.contract';
import { PrismaService } from './identity-prisma';

type StaffInviteRecord = {
  inviteStableId: string;
  email: string;
  role: StaffAccountRole;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  sentCount: number;
  lastSentAt: Date | null;
  invitedBy?: { userStableId: string } | null;
};

export class StaffAdministrationService implements StaffAdministrationPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly staffInviteDelivery: StaffInviteDeliveryPort,
  ) {}

  private requireManagedRole(role: StaffAccountRole): ManagedStaffRole {
    if (role === 'ADMIN' || role === 'STAFF') return role;
    throw new Error(`Unexpected managed staff role: ${role}`);
  }

  private resolveInviteStatus(invite: {
    usedAt: Date | null;
    expiresAt: Date;
    revokedAt: Date | null;
  }): StaffInviteStatus {
    if (invite.revokedAt) return 'REVOKED';
    if (invite.usedAt) return 'ACCEPTED';
    if (invite.expiresAt.getTime() <= Date.now()) return 'EXPIRED';
    return 'PENDING';
  }

  private toInviteDto(invite: StaffInviteRecord): StaffInviteDto {
    return {
      inviteStableId: invite.inviteStableId,
      email: invite.email,
      roleToGrant: invite.role,
      status: this.resolveInviteStatus(invite),
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      acceptedAt: invite.usedAt,
      sentCount: invite.sentCount ?? 0,
      lastSentAt: invite.lastSentAt ?? null,
      invitedByUserStableId: invite.invitedBy?.userStableId ?? null,
    };
  }

  async listStaff(): Promise<{ staff: StaffUserDto[] }> {
    const users = await this.prisma.user.findMany({
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

    return {
      staff: users.map((user) => ({
        userStableId: user.userStableId,
        email: user.email ?? null,
        role: this.requireManagedRole(user.role),
        status: user.status,
        createdAt: user.createdAt,
        lastLoginAt: user.sessions[0]?.createdAt ?? null,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
      })),
    };
  }

  async updateStaff(params: UpdateStaffInput): Promise<StaffUserDto> {
    const target = await this.prisma.user.findUnique({
      where: { userStableId: params.targetUserStableId },
    });

    if (!target) {
      throw new StaffAdministrationError('USER_NOT_FOUND', 'User not found');
    }

    if (target.userStableId === params.actorUserStableId) {
      throw new StaffAdministrationError(
        'CURRENT_USER_MODIFICATION',
        'Cannot modify current user',
      );
    }

    const nextRole = params.role ?? target.role;
    const nextStatus = params.status ?? target.status;

    if (nextRole !== 'ADMIN' && nextRole !== 'STAFF') {
      throw new StaffAdministrationError('INVALID_ROLE', 'invalid role');
    }
    if (nextStatus !== 'ACTIVE' && nextStatus !== 'DISABLED') {
      throw new StaffAdministrationError('INVALID_STATUS', 'invalid status');
    }

    const removingAdmin =
      target.role === 'ADMIN' &&
      target.status === 'ACTIVE' &&
      (nextRole !== 'ADMIN' || nextStatus !== 'ACTIVE');

    if (removingAdmin) {
      const activeAdminCount = await this.prisma.user.count({
        where: { role: 'ADMIN', status: 'ACTIVE' },
      });
      if (activeAdminCount <= 1) {
        throw new StaffAdministrationError(
          'LAST_ACTIVE_ADMIN',
          'Cannot modify last active admin',
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: { role: nextRole, status: nextStatus },
      include: {
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    return {
      userStableId: updated.userStableId,
      email: updated.email ?? null,
      role: nextRole,
      status: nextStatus,
      createdAt: updated.createdAt,
      lastLoginAt: updated.sessions[0]?.createdAt ?? null,
      name:
        [updated.firstName, updated.lastName].filter(Boolean).join(' ') || null,
    };
  }

  async listInvites(): Promise<{ invites: StaffInviteDto[] }> {
    const invites = await this.prisma.userInvite.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        invitedBy: {
          select: { userStableId: true },
        },
      },
    });

    return {
      invites: invites.map((invite) => this.toInviteDto(invite)),
    };
  }

  async createInvite(
    params: CreateStaffInviteInput,
  ): Promise<{ invite: StaffInviteDto; token: string }> {
    const inviter = await this.prisma.user.findUnique({
      where: { userStableId: params.inviterUserStableId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!inviter) {
      throw new StaffAdministrationError('MISSING_INVITER', 'Missing inviter');
    }

    const { invite, token } = await this.authService.createStaffInvite({
      inviterId: inviter.id,
      email: params.email,
      role: params.role,
    });

    await this.staffInviteDelivery.sendStaffInvite({
      to: invite.email,
      token,
      role: invite.role,
      inviterName:
        [inviter.firstName, inviter.lastName].filter(Boolean).join(' ') ||
        undefined,
      locale: params.locale,
    });

    return { invite: this.toInviteDto(invite), token };
  }

  async resendInvite(
    inviteStableId: string,
    locale?: string,
  ): Promise<{ invite: StaffInviteDto; token: string }> {
    const { invite, token } =
      await this.authService.resendStaffInvite(inviteStableId);

    await this.staffInviteDelivery.sendStaffInvite({
      to: invite.email,
      token,
      role: invite.role,
      locale,
    });

    return { invite: this.toInviteDto(invite), token };
  }

  async revokeInvite(inviteStableId: string): Promise<StaffInviteDto> {
    const invite = await this.authService.revokeStaffInvite(inviteStableId);
    return this.toInviteDto(invite);
  }
}
