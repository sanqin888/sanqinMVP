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

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PosDeviceGuard, type AuthenticatedPosIdentity } from '../pos/public-api';
import { PaymentExceptionOrchestrationService } from './payment-exception-orchestration.service';
import { toPaymentExceptionPublicView } from './payment-exception-public-view';

const CreateSchema = z.object({
  operatorNote: z.string().trim().min(12).max(500),
  cloverOrderId: z.string().trim().min(4).max(50).optional(),
  confirmation: z.literal('CONFIRM REVIEW'),
});

type RequestWithPos = Request & {
  user?: User;
  posDevice?: AuthenticatedPosIdentity;
};

@Controller('pos/payments/exceptions')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('STAFF', 'ADMIN')
export class PosPaymentExceptionController {
  constructor(private readonly exceptions: PaymentExceptionOrchestrationService) {}

  private identity(req: RequestWithPos) {
    const actor = req.user?.userStableId?.trim();
    const store = req.posDevice?.storeStableId?.trim();
    if (!actor || !store) {
      throw new UnauthorizedException('Authenticated operator and POS Store required');
    }
    return { actor, store };
  }

  @Get()
  async list(@Req() req: RequestWithPos) {
    const rows = await this.exceptions.listForStore(this.identity(req).store);
    return rows.map(toPaymentExceptionPublicView);
  }

  @Get('attempt/:attemptId')
  async byAttempt(
    @Req() req: RequestWithPos,
    @Param('attemptId') attemptId: string,
  ) {
    const row = await this.exceptions.byAttempt(this.identity(req).store, attemptId);
    return row ? toPaymentExceptionPublicView(row) : null;
  }

  @Post('attempt/:attemptId')
  async submit(
    @Req() req: RequestWithPos,
    @Param('attemptId') attemptId: string,
    @Body(new ZodValidationPipe(CreateSchema)) body: z.infer<typeof CreateSchema>,
  ) {
    const { actor, store } = this.identity(req);
    const row = await this.exceptions.submit(
      store,
      attemptId,
      actor,
      body.operatorNote,
      body.cloverOrderId,
    );
    return toPaymentExceptionPublicView(row);
  }

  @Post('case/:caseStableId/execute')
  async execute(
    @Req() req: RequestWithPos,
    @Param('caseStableId') caseStableId: string,
  ) {
    const row = await this.exceptions.execute(caseStableId, this.identity(req).store);
    return toPaymentExceptionPublicView(row);
  }
}
