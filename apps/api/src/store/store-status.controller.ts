// apps/api/src/store/store-status.controller.ts

import { Controller, Get } from '@nestjs/common';
import { StoreStatusService, type StoreStatus } from './store-status.service';

@Controller('public')
export class StoreStatusController {
  constructor(private readonly service: StoreStatusService) {}

  /**
   * 统一门店状态接口（web 下单 & POS 共用）
   *
   * GET /public/store-status
   */
  @Get('store-status')
  async getStatus(): Promise<StoreStatus> {
    return this.service.getCurrentStatus();
  }
}
