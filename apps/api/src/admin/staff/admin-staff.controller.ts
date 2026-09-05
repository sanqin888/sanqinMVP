// apps/api/src/admin/staff/admin-staff.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminMfaGuard } from '../../auth/admin-mfa.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import {
  type ManagedStaffRole,
  type ManagedStaffStatus,
  STAFF_ADMINISTRATION,
  StaffAdministrationError,
  type StaffAdministrationPort,
  type StaffAccountRole,
} from '../../auth/public-api';

@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/staff')
export class AdminStaffController {
  constructor(
    @Inject(STAFF_ADMINISTRATION)
    private readonly staffAdministration: StaffAdministrationPort,
  ) {}

  private normalizeLocale(value: unknown): 'en' | 'zh' {
    return value === 'zh' ? 'zh' : 'en';
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

  private buildDevInviteUrl(req: Request, locale: 'en' | 'zh', token: string) {
    return (
      this.getPublicOrigin(req) +
      '/' +
      locale +
      '/admin/accept-invite?token=' +
      encodeURIComponent(token)
    );
  }

  private async callStaffAdministration<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof StaffAdministrationError)) {
        throw error;
      }
      if (error.code === 'USER_NOT_FOUND') {
        throw new NotFoundException(error.message);
      }
      throw new BadRequestException(error.message);
    }
  }

  @Get()
  async listStaff() {
    return this.staffAdministration.listStaff();
  }

  @Patch(':userStableId')
  async updateStaff(
    @Req() req: { user?: { userStableId: string } },
    @Param('userStableId') userStableId: string,
    @Body() body: { role?: ManagedStaffRole; status?: ManagedStaffStatus },
  ) {
    const actorUserStableId = req.user?.userStableId;
    if (!actorUserStableId) {
      throw new BadRequestException('Missing actor');
    }

    return this.callStaffAdministration(() =>
      this.staffAdministration.updateStaff({
        actorUserStableId,
        targetUserStableId: userStableId,
        role: body.role,
        status: body.status,
      }),
    );
  }

  @Get('invites')
  async listInvites() {
    return this.staffAdministration.listInvites();
  }

  @Post('invites')
  async createInvite(
    @Req() req: Request & { user?: { userStableId: string } },
    @Body()
    body: { email?: string; role?: StaffAccountRole; locale?: 'en' | 'zh' },
  ) {
    const inviterUserStableId = req.user?.userStableId;
    if (!inviterUserStableId) {
      throw new BadRequestException('Missing inviter');
    }

    const { invite, token } = await this.callStaffAdministration(() =>
      this.staffAdministration.createInvite({
        inviterUserStableId,
        email: body.email ?? '',
        role: body.role ?? 'STAFF',
        locale: body.locale,
      }),
    );

    if (process.env.NODE_ENV !== 'production') {
      const locale = this.normalizeLocale(body.locale);
      return {
        ...invite,
        inviteUrl: this.buildDevInviteUrl(req, locale, token),
      };
    }

    return invite;
  }

  @Post('invites/:inviteStableId/resend')
  async resendInvite(
    @Req() req: Request,
    @Param('inviteStableId') inviteStableId: string,
    @Query('locale') localeRaw?: string,
  ) {
    const locale = this.normalizeLocale(localeRaw);
    const { invite, token } = await this.staffAdministration.resendInvite(
      inviteStableId,
      locale,
    );

    if (process.env.NODE_ENV !== 'production') {
      return {
        ...invite,
        inviteUrl: this.buildDevInviteUrl(req, locale, token),
      };
    }

    return invite;
  }

  @Post('invites/:inviteStableId/revoke')
  async revokeInvite(@Param('inviteStableId') inviteStableId: string) {
    return this.staffAdministration.revokeInvite(inviteStableId);
  }
}
