//apps/api/src/pos/pos-summary.controller.ts
import {
  Controller,
  Get,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PosSummaryService } from './pos-summary.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PosDeviceGuard } from './pos-device.guard';
import { PosGateway } from './pos.gateway';
import { resolveConfiguredStoreStableId } from '../store/public-api';
import {
  LOYALTY_POLICY_READER,
  type LoyaltyPolicyReaderPort,
  type LoyaltyPolicySnapshot,
} from '../loyalty/public-api';

@Controller('pos/summary')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
export class PosSummaryController {
  constructor(
    private readonly service: PosSummaryService,
    private readonly posGateway: PosGateway,
  ) {}

  /**
   * GET /api/v1/pos/summary?timeMin=...&timeMax=...&fulfillmentType=pickup|dine_in|delivery&status=paid|refunded|void&payment=cash|card|online|store_balance
   */
  @Get()
  getSummary(
    @Query('timeMin') timeMin: string,
    @Query('timeMax') timeMax: string,
    @Query('fulfillmentType') fulfillmentType?: string,
    @Query('status') statusBucket?: string,
    @Query('payment') paymentBucket?: string,
  ) {
    return this.service.summary({
      timeMin,
      timeMax,
      fulfillmentType,
      status: statusBucket,
      payment: paymentBucket,
    });
  }

  @Post('print')
  async printSummary(
    @Query('timeMin') timeMin: string,
    @Query('timeMax') timeMax: string,
    @Query('storeId') storeId?: string,
    @Query('breakdownType') breakdownType?: 'payment' | 'channel',
    @Query('fulfillmentType') fulfillmentType?: string,
    @Query('status') statusBucket?: string,
    @Query('payment') paymentBucket?: string,
  ) {
    const data = await this.service.summary({
      timeMin,
      timeMax,
      fulfillmentType,
      status: statusBucket,
      payment: paymentBucket,
    });

    this.posGateway.sendPrintSummary(
      storeId?.trim() || resolveConfiguredStoreStableId(),
      {
        ...data,
        breakdownType,
      },
    );

    return { success: true };
  }
}

@Controller('pos/loyalty-policy')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
export class PosLoyaltyPolicyController {
  constructor(
    @Inject(LOYALTY_POLICY_READER)
    private readonly loyaltyPolicyReader: LoyaltyPolicyReaderPort,
  ) {}

  @Get()
  getPolicy(): Promise<LoyaltyPolicySnapshot> {
    return this.loyaltyPolicyReader.getLoyaltyPolicySnapshot();
  }
}
