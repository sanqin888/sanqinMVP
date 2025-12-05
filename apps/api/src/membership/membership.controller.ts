// apps/api/src/membership/membership.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { MembershipService } from './membership.service';

@Controller('membership')
export class MembershipController {
  constructor(private readonly membership: MembershipService) {}

  @Get('summary')
  async summary(
    @Query('userId') userId?: string,
    @Query('name') name?: string,
    @Query('email') email?: string,
    @Query('referrerEmail') referrerEmail?: string,
    @Query('birthdayMonth') birthdayMonthRaw?: string,
    @Query('birthdayDay') birthdayDayRaw?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    // 把 query 里的生日转成 number，非法就当 undefined
    let birthdayMonth: number | undefined;
    let birthdayDay: number | undefined;

    if (birthdayMonthRaw && birthdayMonthRaw.trim() !== '') {
      const m = Number.parseInt(birthdayMonthRaw, 10);
      if (Number.isFinite(m)) birthdayMonth = m;
    }

    if (birthdayDayRaw && birthdayDayRaw.trim() !== '') {
      const d = Number.parseInt(birthdayDayRaw, 10);
      if (Number.isFinite(d)) birthdayDay = d;
    }

    return this.membership.getMemberSummary({
      userId,
      name: name ?? null,
      email: email ?? null,
      referrerEmail,
      birthdayMonth,
      birthdayDay,
    });
  }

  // ✅ 积分流水接口保持不变
  @Get('loyalty-ledger')
  async loyaltyLedger(
    @Query('userId') userId?: string,
    @Query('limit') limitRaw?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const limit = limitRaw ? Number.parseInt(limitRaw, 10) || 50 : 50;

    return this.membership.getLoyaltyLedger({
      userId,
      limit,
    });
  }

  // ✅ 营销邮件订阅接口保持不变
  @Post('marketing-consent')
  async updateMarketingConsent(
    @Body()
    body: {
      userId?: string;
      marketingEmailOptIn?: boolean;
    },
  ) {
    const { userId, marketingEmailOptIn } = body;

    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    if (typeof marketingEmailOptIn !== 'boolean') {
      throw new BadRequestException('marketingEmailOptIn must be boolean');
    }

    const user = await this.membership.updateMarketingConsent({
      userId,
      marketingEmailOptIn,
    });

    return {
      success: true,
      user,
    };
  }

  @Get('coupons')
  async listCoupons(@Query('userId') userId?: string) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    return this.membership.listCoupons({ userId });
  }
}
