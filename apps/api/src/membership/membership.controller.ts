// apps/api/src/membership/membership.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { MembershipService } from './membership.service';

type AuthedRequest = Request & {
  user?: { id?: string };
};

@Controller('membership')
export class MembershipController {
  constructor(private readonly membership: MembershipService) {}

  /**
   * 统一解析 userId：
   * 优先级：session(req.user.id) > body.userId > query.userId > header(x-user-id)
   */
  private resolveUserId(
    req: AuthedRequest,
    opts: { queryUserId?: string; bodyUserId?: string } = {},
  ): string {
    const { queryUserId, bodyUserId } = opts;

    const sessionId = req.user?.id;

    const headerRaw = req.headers['x-user-id'];
    const headerId =
      typeof headerRaw === 'string'
        ? headerRaw
        : Array.isArray(headerRaw)
          ? headerRaw[0]
          : undefined;

    const userId =
      sessionId ??
      (bodyUserId && bodyUserId.trim()) ??
      (queryUserId && queryUserId.trim()) ??
      (headerId && headerId.trim());

    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    return userId;
  }

  @Get('summary')
  async summary(
    @Req() req: AuthedRequest,
    @Query('userId') userIdFromQuery?: string,
    @Query('name') name?: string,
    @Query('email') email?: string,
    @Query('referrerEmail') referrerEmail?: string,
    @Query('birthdayMonth') birthdayMonthRaw?: string,
    @Query('birthdayDay') birthdayDayRaw?: string,
    // ⭐ 新增：手机号 + 验证 token
    @Query('phone') phoneFromQuery?: string,
    @Query('pv') phoneVerificationToken?: string,
  ) {
    const userId = this.resolveUserId(req, { queryUserId: userIdFromQuery });

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
      phone: phoneFromQuery,
      phoneVerificationToken,
    });
  }

  // ✅ 积分流水
  @Get('loyalty-ledger')
  async loyaltyLedger(
    @Req() req: AuthedRequest,
    @Query('userId') userIdFromQuery?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const userId = this.resolveUserId(req, { queryUserId: userIdFromQuery });

    const limit = limitRaw ? Number.parseInt(limitRaw, 10) || 50 : 50;

    return this.membership.getLoyaltyLedger({
      userId,
      limit,
    });
  }

  // ✅ 营销邮件订阅
  @Post('marketing-consent')
  async updateMarketingConsent(
    @Req() req: AuthedRequest,
    @Body()
    body: {
      userId?: string;
      marketingEmailOptIn?: boolean;
    },
  ) {
    const userId = this.resolveUserId(req, { bodyUserId: body.userId });
    const { marketingEmailOptIn } = body;

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

  // ✅ 优惠券列表（会自动补发欢迎券 / 生日券）
  @Get('coupons')
  async listCoupons(
    @Req() req: AuthedRequest,
    @Query('userId') userIdFromQuery?: string,
  ) {
    const userId = this.resolveUserId(req, { queryUserId: userIdFromQuery });
    return this.membership.listCoupons({ userId });
  }
}
