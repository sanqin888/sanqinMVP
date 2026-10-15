import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { CreateOrderSchema } from '@shared/order';
import type { User } from '@prisma/client';
import type { Request } from 'express';
import { z } from 'zod';

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  PosDeviceGuard,
  type AuthenticatedPosIdentity,
} from '../pos/public-api';
import { PosCardPaymentOrchestrationService } from './pos-card-payment-orchestration.service';

const PosCardPaymentStartSchema = z.object({
  attemptId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(128),
  retryPromptEnabled: z.boolean().optional(),
  asyncTerminalFlow: z.boolean().optional(),
  order: CreateOrderSchema,
});

type PosCardPaymentStartDto = z.infer<typeof PosCardPaymentStartSchema>;

const SandboxManualUnpaidSchema = z.object({
  confirmation: z.literal('CONFIRM UNPAID'),
  cloverOrderId: z.string().trim().min(4).max(50),
  operatorNote: z.string().trim().min(12).max(500),
});

type SandboxManualUnpaidDto = z.infer<typeof SandboxManualUnpaidSchema>;

type PosDeviceRequest = Request & {
  posDevice?: AuthenticatedPosIdentity;
  user?: User;
};

@Controller('pos/payments/card')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
export class PosCardPaymentController {
  constructor(
    private readonly cardPayments: PosCardPaymentOrchestrationService,
  ) {}

  @Get('config')
  getConfig(@Req() req: PosDeviceRequest) {
    return this.cardPayments.getConfig(this.requireStoreStableId(req));
  }

  @Get('availability')
  getAvailability(@Req() req: PosDeviceRequest) {
    return this.cardPayments.getAvailability(this.requireStoreStableId(req));
  }

  @Get('benefits-review')
  getBenefitsReview(@Req() req: PosDeviceRequest) {
    return this.cardPayments.getBenefitsReview(this.requireStoreStableId(req));
  }

  // Stored original attempt facts only; does not contact Clover.
  @Get('review/:attemptId')
  getReviewAttempt(
    @Req() req: PosDeviceRequest,
    @Param('attemptId') attemptId: string,
  ) {
    return this.cardPayments.getReviewAttempt(
      this.requireStoreStableId(req),
      attemptId,
    );
  }

  // Explicit canonical payment recheck; never starts or resumes a Sale.
  @Post('review/:attemptId/recheck')
  recheckReviewAttempt(
    @Req() req: PosDeviceRequest,
    @Param('attemptId') attemptId: string,
  ) {
    return this.cardPayments.recheckReviewAttempt(
      this.requireStoreStableId(req),
      attemptId,
    );
  }

  @Post('review/:attemptId/manual-close-unpaid')
  manuallyCloseSandboxUnpaid(
    @Req() req: PosDeviceRequest,
    @Param('attemptId') attemptId: string,
    @Body(new ZodValidationPipe(SandboxManualUnpaidSchema))
    body: SandboxManualUnpaidDto,
  ) {
    const actor = req.user?.userStableId?.trim();
    if (!actor) {
      throw new UnauthorizedException('Authenticated operator identity required');
    }
    return this.cardPayments.manuallyCloseSandboxUnpaid(
      this.requireStoreStableId(req),
      attemptId,
      actor,
      body.cloverOrderId,
      body.operatorNote,
    );
  }

  @Post('start')
  @UsePipes(new ZodValidationPipe(PosCardPaymentStartSchema))
  start(@Req() req: PosDeviceRequest, @Body() body: PosCardPaymentStartDto) {
    return this.cardPayments.start(this.requireStoreStableId(req), body);
  }

  @Post('recover')
  @UsePipes(new ZodValidationPipe(PosCardPaymentStartSchema))
  recover(@Req() req: PosDeviceRequest, @Body() body: PosCardPaymentStartDto) {
    return this.cardPayments.recover(this.requireStoreStableId(req), body);
  }

  @Post('resume-original')
  @UsePipes(new ZodValidationPipe(PosCardPaymentStartSchema))
  resumeOriginal(
    @Req() req: PosDeviceRequest,
    @Body() body: PosCardPaymentStartDto,
  ) {
    return this.cardPayments.resumeOriginalSale(
      this.requireStoreStableId(req),
      body,
    );
  }

  @Post(':attemptId/cancel')
  cancel(
    @Req() req: PosDeviceRequest,
    @Param('attemptId') attemptId: string,
    @Body(new ZodValidationPipe(PosCardPaymentStartSchema))
    body: PosCardPaymentStartDto,
  ) {
    if (body.attemptId !== attemptId) {
      throw new BadRequestException({
        code: 'POS_CARD_PAYMENT_ATTEMPT_MISMATCH',
        message: 'Path attemptId must match the saved payment request.',
      });
    }
    return this.cardPayments.cancel(this.requireStoreStableId(req), body);
  }

  private requireStoreStableId(req: PosDeviceRequest): string {
    const storeStableId = req.posDevice?.storeStableId?.trim();
    if (!storeStableId) {
      throw new UnauthorizedException('POS device store unavailable');
    }
    return storeStableId;
  }
}
