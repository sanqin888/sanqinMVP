import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { z } from 'zod';

import { AdminMfaGuard } from '../auth/admin-mfa.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PaymentExceptionOrchestrationService } from './payment-exception-orchestration.service';
import { toPaymentExceptionPublicView } from './payment-exception-public-view';

const DecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().min(12).max(500),
});

@Controller('admin/payments/exceptions')
@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Roles('ADMIN')
export class AdminPaymentExceptionController {
  constructor(private readonly exceptions: PaymentExceptionOrchestrationService) {}

  @Get()
  async list() {
    const rows = await this.exceptions.listForAdmin();
    return rows.map(toPaymentExceptionPublicView);
  }

  @Post(':caseStableId/decision')
  async decide(
    @Req() req: Request & { user?: User },
    @Param('caseStableId') caseStableId: string,
    @Body(new ZodValidationPipe(DecisionSchema))
    body: z.infer<typeof DecisionSchema>,
  ) {
    const actor = req.user?.userStableId?.trim();
    if (!actor) throw new UnauthorizedException('Admin identity required');
    const row = await this.exceptions.decide(caseStableId, actor, body.decision, body.note);
    return toPaymentExceptionPublicView(row);
  }

  @Post(':caseStableId/retry')
  async retry(
    @Req() req: Request & { user?: User },
    @Param('caseStableId') caseStableId: string,
  ) {
    const actor = req.user?.userStableId?.trim();
    if (!actor) throw new UnauthorizedException('Admin identity required');
    const target = await this.exceptions.getForAdmin(caseStableId);
    if (!target) throw new UnauthorizedException('Case not in admin review scope');
    const row = await this.exceptions.execute(caseStableId, target.storeStableId, true);
    return toPaymentExceptionPublicView(row);
  }
}
