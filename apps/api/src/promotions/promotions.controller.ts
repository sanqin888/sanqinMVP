// apps/api/src/promotions/promotions.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  COUPON_PROGRAM_CLAIMS,
  type CouponProgramClaimsPort,
} from '../benefits/public-api';

type AuthedRequest = Request & {
  user?: { userStableId?: string };
};

@UseGuards(SessionAuthGuard)
@Controller('promotions')
export class PromotionsController {
  constructor(
    @Inject(COUPON_PROGRAM_CLAIMS)
    private readonly couponClaims: CouponProgramClaimsPort,
  ) {}

  @Get('claimable')
  @Header('Cache-Control', 'no-store')
  async getClaimable(@Req() req: AuthedRequest) {
    return this.couponClaims.listManualClaimPrograms(
      this.requireUserStableId(req),
    );
  }

  @Post('programs/:programStableId/claim')
  async claimProgram(
    @Req() req: AuthedRequest,
    @Param('programStableId') programStableId: string,
  ) {
    return this.couponClaims.claimManual(
      this.requireUserStableId(req),
      programStableId,
    );
  }

  @Post('promo-code/claim')
  async claimPromoCode(
    @Req() req: AuthedRequest,
    @Body() body: { code?: string },
  ) {
    return this.couponClaims.claimPromoCode(
      this.requireUserStableId(req),
      body.code ?? '',
    );
  }

  private requireUserStableId(req: AuthedRequest): string {
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }
    return userStableId;
  }
}
