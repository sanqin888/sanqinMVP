import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PosDeviceGuard } from './pos-device.guard';
import {
  PosExchangeRateService,
  type PosExchangeRateQuote,
} from './pos-exchange-rate.service';

@Controller('pos/exchange-rate')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
export class PosExchangeRateController {
  constructor(private readonly service: PosExchangeRateService) {}

  @Post('quote')
  async quote(
    @Body() body: { cadAmountCents?: number },
  ): Promise<PosExchangeRateQuote> {
    return this.service.quoteCadToCny(body?.cadAmountCents ?? Number.NaN);
  }
}
