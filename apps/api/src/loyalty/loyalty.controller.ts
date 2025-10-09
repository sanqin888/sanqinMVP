import { Controller, Get, Query } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';

@Controller('api/loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('account')
  async account(@Query('userId') userId: string) {
    return this.loyalty.getOrCreateAccount(userId);
  }

  @Get('ledger')
  async ledger(
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    // 服务里已做 BigInt → number 的转换，这里直接返回
    return this.loyalty.listLedger(userId, Number(limit ?? 50));
  }
}
