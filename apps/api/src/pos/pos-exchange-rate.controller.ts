import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedPosIdentity } from './pos-device-management.contract';
import { PosDeviceGuard } from './pos-device.guard';
import {
  PosExchangeRateService,
  type PosExchangeRateQuote,
} from './pos-exchange-rate.service';

type PosExchangeRateRequest = Request & {
  posDevice?: AuthenticatedPosIdentity;
};

function requireStoreStableId(req: PosExchangeRateRequest): string {
  const storeStableId = req.posDevice?.storeStableId?.trim();
  if (!storeStableId) {
    throw new UnauthorizedException('POS device store unavailable');
  }
  return storeStableId;
}

@Controller('pos/exchange-rate')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
export class PosExchangeRateController {
  constructor(private readonly service: PosExchangeRateService) {}

  @Post('quote')
  async quote(
    @Req() req: PosExchangeRateRequest,
    @Body() body: { cadAmountCents?: number },
  ): Promise<PosExchangeRateQuote> {
    return this.service.quoteCadToCny(
      requireStoreStableId(req),
      body?.cadAmountCents ?? Number.NaN,
    );
  }
}
