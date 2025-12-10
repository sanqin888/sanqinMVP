// apps/api/src/admin/business/admin-business.controller.ts

import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import {
  AdminBusinessService,
  type BusinessConfigResponse,
} from './admin-business.service';

@Controller('admin/business')
export class AdminBusinessController {
  constructor(private readonly service: AdminBusinessService) {}

  /**
   * 获取完整门店配置：
   * - timezone
   * - isTemporarilyClosed / temporaryCloseReason
   * - 每周营业时间
   * - 节假日
   */
  @Get('config')
  async getConfig(): Promise<BusinessConfigResponse> {
    return this.service.getConfig();
  }

  /**
   * 更新“临时暂停接单”状态（当前前端使用的接口）：
   * PATCH /admin/business/config
   * body:
   * {
   *   "isTemporarilyClosed": true,
   *   "reason": "厨房维护"
   * }
   */
  @Patch('config')
  async patchConfig(
    @Body()
    body: {
      isTemporarilyClosed?: boolean;
      reason?: string;
    },
  ): Promise<BusinessConfigResponse> {
    return this.service.updateTemporaryClose(body);
  }

  /**
   * 兼容旧接口：PUT /admin/business/temporary-close
   * body 结构同上
   */
  @Put('temporary-close')
  async updateTemporaryClose(
    @Body()
    body: {
      isTemporarilyClosed?: boolean;
      reason?: string;
    },
  ): Promise<BusinessConfigResponse> {
    return this.service.updateTemporaryClose(body);
  }

  /**
   * 覆盖式保存节假日：
   * {
   *   "holidays": [
   *     {
   *       "date": "2025-12-25",
   *       "name": "圣诞节",
   *       "isClosed": true
   *     },
   *     {
   *       "date": "2025-01-01",
   *       "name": "元旦",
   *       "isClosed": false,
   *       "openMinutes": 720,
   *       "closeMinutes": 1200
   *     }
   *   ]
   * }
   */
  @Put('holidays')
  async saveHolidays(
    @Body()
    body: {
      holidays?: unknown;
    },
  ): Promise<BusinessConfigResponse> {
    return this.service.saveHolidays(body);
  }
}
