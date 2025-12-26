// apps/api/src/admin/users/admin-users.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AuthService } from '../../auth/auth.service';
import type { UserRole } from '@prisma/client';

@Controller('admin/users')
@UseGuards(SessionAuthGuard, RolesGuard)
export class AdminUsersController {
  constructor(private readonly authService: AuthService) {}

  @Post('invite')
  @Roles('ADMIN', 'STAFF')
  async inviteStaff(
    @Req() req: { user?: { id: string } },
    @Body() body: { email?: string; role?: UserRole; expiresInHours?: number },
  ) {
    if (!req.user?.id) {
      throw new BadRequestException('Missing inviter');
    }

    const inviteRole = body.role ?? 'STAFF';
    if (!body.email) {
      throw new BadRequestException('email is required');
    }
    return this.authService.createInvite({
      inviterId: req.user.id,
      email: body.email,
      role: inviteRole,
      expiresInHours: body.expiresInHours,
    });
  }
}
