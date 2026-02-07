// apps/api/src/admin/staff/admin-staff.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AdminMfaGuard } from '../../auth/admin-mfa.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { EmailService } from '../../email/email.service';
import type { UserRole, UserStatus } from '@prisma/client';
import type { Request } from 'express';

type StaffUserDto = {
  userStableId: string;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  lastLoginAt: Date | null;
  name: string | null;
};

type StaffInviteStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

type StaffInviteDto = {
  inviteStableId: string;
  email: string;
  roleToGrant: UserRole;
  status: StaffInviteStatus;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  sentCount: number;
  lastSentAt: Date | null;
  invitedByUserStableId: string | null;
};

@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/staff')
export class AdminStaffController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
  ) {}

  private normalizeLocale(v: unknown): 'en' | 'zh' {
    return v === 'zh' ? 'zh' : 'en';
  }

  private getPublicOrigin(req: Request): string {
    const env = process.env.PUBLIC_WEB_BASE_URL;
    if (env) return env.replace(/\/$/, '');

    const xfProto = req.headers['x-forwarded-proto'];
    const xfHost = req.headers['x-forwarded-host'];

    const proto =
      (typeof xfProto === 'string' ? xfProto.split(',')[0] : undefined) ??
      req.protocol;
    const host =
      (typeof xfHost === 'string' ? xfHost.split(',')[0] : undefined) ??
      req.get('host');

    return `${proto}://${host}`;
  }

  private getInviteStatus(invite: {
    usedAt: Date | null;
    expiresAt: Date;
    revokedAt: Date | null;
  }): StaffInviteStatus {
    if (invite.revokedAt) return 'REVOKED';
    if (invite.usedAt) return 'ACCEPTED';
    if (invite.expiresAt.getTime() <= Date.now()) return 'EXPIRED';
    return 'PENDING';
  }

  private toInviteDto(invite: {
    inviteStableId: string;
    email: string;
    role: UserRole;
    createdAt: Date;
    expiresAt: Date;
    usedAt: Date | null;
    revokedAt: Date | null;
    sentCount: number;
    lastSentAt: Date | null;
    invitedBy?: { userStableId: string } | null;
  }): StaffInviteDto {
    return {
      inviteStableId: invite.inviteStableId,
      email: invite.email,
      roleToGrant: invite.role,
      status: this.getInviteStatus(invite),
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      acceptedAt: invite.usedAt,
      sentCount: invite.sentCount ?? 0,
      lastSentAt: invite.lastSentAt ?? null,
      invitedByUserStableId: invite.invitedBy?.userStableId ?? null,
    };
  }

  @Get()
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

    const staff = users.map((user) => ({
      userStableId: user.userStableId,
      email: user.email ?? null,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      lastLoginAt: user.sessions[0]?.createdAt ?? null,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
    }));

    return { staff };
  }

  @Patch(':userStableId')
  async updateStaff(
    @Req() req: { user?: { id: string; userStableId: string } },
    @Param('userStableId') userStableId: string,
    @Body() body: { role?: UserRole; status?: UserStatus },
  ): Promise<StaffUserDto> {
    const actor = req.user;
    if (!actor?.id) {
      throw new BadRequestException('Missing actor');
    }

    const target = await this.prisma.user.findUnique({
      where: { userStableId },
    });

    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (target.id === actor.id) {
      throw new BadRequestException('Cannot modify current user');
    }

    const nextRole = body.role ?? target.role;
    const nextStatus = body.status ?? target.status;

    if (nextRole !== 'ADMIN' && nextRole !== 'STAFF') {
      throw new BadRequestException('invalid role');
    }
    if (nextStatus !== 'ACTIVE' && nextStatus !== 'DISABLED') {
      throw new BadRequestException('invalid status');
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
        throw new BadRequestException('Cannot modify last active admin');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: {
        role: nextRole,
        status: nextStatus,
      },
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
      role: updated.role,
      status: updated.status,
      createdAt: updated.createdAt,
      lastLoginAt: updated.sessions[0]?.createdAt ?? null,
      name: updated.name ?? null,
    };
  }

  @Get('invites')
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

  @Post('invites')
  async createInvite(
    @Req() req: Request & { user?: { id: string } },
    @Body() body: { email?: string; role?: UserRole; locale?: 'en' | 'zh' },
  ): Promise<StaffInviteDto & { inviteUrl?: string }> {
    if (!req.user?.id) {
      throw new BadRequestException('Missing inviter');
    }

    const inviter = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { firstName: true, lastName: true },
    });

    const { invite, token } = await this.authService.createStaffInvite({
      inviterId: req.user.id,
      email: body.email ?? '',
      role: body.role ?? 'STAFF',
    });

    await this.emailService.sendStaffInviteEmail({
      to: invite.email,
      token,
      role: invite.role,
      inviterName: inviter
        ? [inviter.firstName, inviter.lastName].filter(Boolean).join(' ')
        : undefined,
      locale: body.locale,
    });

    const dto = this.toInviteDto(invite);

    // ✅ 仅 dev / 非生产：返回 inviteUrl（包含 token）
    if (process.env.NODE_ENV !== 'production') {
      const locale = this.normalizeLocale(body.locale);
      const origin = this.getPublicOrigin(req);
      const inviteUrl = `${origin}/${locale}/admin/accept-invite?token=${encodeURIComponent(token)}`;
      return { ...dto, inviteUrl };
    }

    return dto;
  }

  @Post('invites/:inviteStableId/resend')
  async resendInvite(
    @Req() req: Request,
    @Param('inviteStableId') inviteStableId: string,
    @Query('locale') localeRaw?: string,
  ): Promise<StaffInviteDto & { inviteUrl?: string }> {
    const { invite, token } =
      await this.authService.resendStaffInvite(inviteStableId);

    await this.emailService.sendStaffInviteEmail({
      to: invite.email,
      token,
      role: invite.role,
      locale: this.normalizeLocale(localeRaw),
    });
    const dto = this.toInviteDto(invite);

    if (process.env.NODE_ENV !== 'production') {
      const locale = this.normalizeLocale(localeRaw);
      const origin = this.getPublicOrigin(req);
      const inviteUrl = `${origin}/${locale}/admin/accept-invite?token=${encodeURIComponent(token)}`;
      return { ...dto, inviteUrl };
    }

    return dto;
  }

  @Post('invites/:inviteStableId/revoke')
  async revokeInvite(@Param('inviteStableId') inviteStableId: string) {
    const invite = await this.authService.revokeStaffInvite(inviteStableId);
    return this.toInviteDto(invite);
  }
}
