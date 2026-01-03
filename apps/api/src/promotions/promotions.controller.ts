// apps/api/src/promotions/promotions.controller.ts
import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PromotionsService } from './promotions.service';
import { MenuEntitlementsResponse } from '@shared/menu';

type AuthedRequest = Request & {
  user?: { userStableId?: string };
};

@UseGuards(SessionAuthGuard)
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get('entitlements')
  @Header('Cache-Control', 'no-store')
  async getEntitlements(
    @Req() req: AuthedRequest,
  ): Promise<MenuEntitlementsResponse> {
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }
    return this.promotions.getMenuEntitlements(userStableId);
  }
}
