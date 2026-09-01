//apps/api/src/pos/pos-summary.controller.ts
import {
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PosSummaryService } from './pos-summary.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedPosIdentity } from './pos-device-management.contract';
import { PosDeviceGuard } from './pos-device.guard';
import { PosGateway } from './pos.gateway';
import {
  LOYALTY_POLICY_READER,
  type LoyaltyPolicyReaderPort,
  type LoyaltyPolicySnapshot,
} from '../loyalty/public-api';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';

type PosDeviceRequest = Request & {
  posDevice?: AuthenticatedPosIdentity;
};

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
    @Req() req: PosDeviceRequest,
    @Query('timeMin') timeMin: string,
    @Query('timeMax') timeMax: string,
    @Query('fulfillmentType') fulfillmentType?: string,
    @Query('status') statusBucket?: string,
    @Query('payment') paymentBucket?: string,
  ) {
    const storeStableId = req.posDevice?.storeStableId;
    if (!storeStableId) {
      throw new UnauthorizedException('POS device store unavailable');
    }

    return this.service.summary({
      storeStableId,
      timeMin,
      timeMax,
      fulfillmentType,
      status: statusBucket,
      payment: paymentBucket,
    });
  }

  @Post('print')
  async printSummary(
    @Req() req: PosDeviceRequest,
    @Query('timeMin') timeMin: string,
    @Query('timeMax') timeMax: string,
    @Query('breakdownType') breakdownType?: 'payment' | 'channel',
    @Query('fulfillmentType') fulfillmentType?: string,
    @Query('status') statusBucket?: string,
    @Query('payment') paymentBucket?: string,
  ) {
    const storeStableId = req.posDevice?.storeStableId;
    if (!storeStableId) {
      throw new UnauthorizedException('POS device store unavailable');
    }

    const data = await this.service.summary({
      storeStableId,
      timeMin,
      timeMax,
      fulfillmentType,
      status: statusBucket,
      payment: paymentBucket,
    });

    this.posGateway.sendPrintSummary(storeStableId, {
      ...data,
      breakdownType,
    });

    return { success: true };
  }
}

type PosStoreContextResponse = {
  storeStableId: string;
  storeName: string;
  timezone: string;
};

@Controller('pos/store-context')
@UseGuards(SessionAuthGuard, RolesGuard, PosDeviceGuard)
@Roles('ADMIN', 'STAFF')
export class PosStoreContextController {
  constructor(
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly brandStoreConfigReader: BrandStoreConfigReaderPort,
  ) {}

  @Get()
  async getStoreContext(
    @Req() req: PosDeviceRequest,
  ): Promise<PosStoreContextResponse> {
    const storeStableId = req.posDevice?.storeStableId;
    if (!storeStableId) {
      throw new UnauthorizedException('POS device store unavailable');
    }

    const store =
      await this.brandStoreConfigReader.getStoreSnapshot(storeStableId);
    return {
      storeStableId: store.storeStableId,
      storeName: store.storeName,
      timezone: store.timezone,
    };
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
