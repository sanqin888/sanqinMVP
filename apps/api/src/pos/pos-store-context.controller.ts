import {
  Controller,
  Get,
  Inject,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';
import type { AuthenticatedPosIdentity } from './pos-device-management.contract';
import { PosDeviceGuard } from './pos-device.guard';

type PosStoreContextRequest = Request & {
  posDevice?: AuthenticatedPosIdentity;
};

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
    @Req() req: PosStoreContextRequest,
  ): Promise<PosStoreContextResponse> {
    const storeStableId = req.posDevice?.storeStableId;
    if (!storeStableId) {
      throw new UnauthorizedException('POS device store unavailable');
    }

    const store = await this.brandStoreConfigReader.getStoreSnapshot(
      storeStableId,
    );
    return {
      storeStableId: store.storeStableId,
      storeName: store.storeName,
      timezone: store.timezone,
    };
  }
}
