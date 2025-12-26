// apps/api/src/membership/membership.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { MembershipService } from './membership.service';
import { isStableId } from '../common/utils/stable-id';

type AuthedRequest = Request & {
  user?: { id?: string; userStableId?: string };
};

@Controller('membership')
export class MembershipController {
  constructor(private readonly membership: MembershipService) {}

  /**
   * 统一解析 userStableId：
   * 优先级：session(req.user.userStableId) > body.userStableId > query.userStableId > header(x-user-stable-id)
   * 兼容：body/query 的 userId 视为 stableId
   */
  private resolveUserStableId(
    req: AuthedRequest,
    opts: { queryUserStableId?: string; bodyUserStableId?: string } = {},
  ): string {
    const { queryUserStableId, bodyUserStableId } = opts;

    const sessionStableId = req.user?.userStableId;

    const headerRaw =
      req.headers['x-user-stable-id'] ?? req.headers['x-user-id'];
    const headerId =
      typeof headerRaw === 'string'
        ? headerRaw
        : Array.isArray(headerRaw)
          ? headerRaw[0]
          : undefined;

    const userStableId =
      sessionStableId ??
      (bodyUserStableId && bodyUserStableId.trim()) ??
      (queryUserStableId && queryUserStableId.trim()) ??
      (headerId && headerId.trim());

    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }

    if (!isStableId(userStableId)) {
      throw new BadRequestException('userStableId must be cuid');
    }

    return userStableId;
  }

  @Get('summary')
  async summary(
    @Req() req: AuthedRequest,
    @Query('userStableId') userStableIdFromQuery?: string,
    @Query('userId') legacyUserIdFromQuery?: string,
    @Query('name') name?: string,
    @Query('email') email?: string,
    @Query('referrerEmail') referrerEmail?: string,
    @Query('birthdayMonth') birthdayMonthRaw?: string,
    @Query('birthdayDay') birthdayDayRaw?: string,
    // ⭐ 新增：手机号 + 验证 token
    @Query('phone') phoneFromQuery?: string,
    @Query('pv') phoneVerificationToken?: string,
  ) {
    const userStableId = this.resolveUserStableId(req, {
      queryUserStableId: userStableIdFromQuery ?? legacyUserIdFromQuery,
    });

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
      userStableId,
      name: name ?? null,
      email: email ?? null,
      referrerEmail,
      birthdayMonth,
      birthdayDay,
      phone: phoneFromQuery,
      phoneVerificationToken,
    });
  }

  @Get('lookup-by-phone')
  async lookupByPhone(@Query('phone') phone?: string) {
    if (!phone) {
      throw new BadRequestException('phone is required');
    }
    return this.membership.getMemberByPhone(phone);
  }

  // ✅ 积分流水
  @Get('loyalty-ledger')
  async loyaltyLedger(
    @Req() req: AuthedRequest,
    @Query('userStableId') userStableIdFromQuery?: string,
    @Query('userId') legacyUserIdFromQuery?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const userStableId = this.resolveUserStableId(req, {
      queryUserStableId: userStableIdFromQuery ?? legacyUserIdFromQuery,
    });

    const limit = limitRaw ? Number.parseInt(limitRaw, 10) || 50 : 50;

    return this.membership.getLoyaltyLedger({
      userStableId,
      limit,
    });
  }

  // ✅ 营销邮件订阅
  @Post('marketing-consent')
  async updateMarketingConsent(
    @Req() req: AuthedRequest,
    @Body()
    body: {
      userStableId?: string;
      userId?: string;
      marketingEmailOptIn?: boolean;
    },
  ) {
    const userStableId = this.resolveUserStableId(req, {
      bodyUserStableId: body.userStableId ?? body.userId,
    });
    const { marketingEmailOptIn } = body;

    if (typeof marketingEmailOptIn !== 'boolean') {
      throw new BadRequestException('marketingEmailOptIn must be boolean');
    }

    const user = await this.membership.updateMarketingConsent({
      userStableId,
      marketingEmailOptIn,
    });

    return {
      success: true,
      user,
    };
  }

  // ✅ 更新昵称 / 生日
  @Post('profile')
  async updateProfile(
    @Req() req: AuthedRequest,
    @Body()
    body: {
      userStableId?: string;
      userId?: string;
      name?: string | null;
      birthdayMonth?: number | null;
      birthdayDay?: number | null;
    },
  ) {
    const userStableId = this.resolveUserStableId(req, {
      bodyUserStableId: body.userStableId ?? body.userId,
    });

    const user = await this.membership.updateProfile({
      userStableId,
      name: body.name ?? null,
      birthdayMonth:
        typeof body.birthdayMonth === 'number' ? body.birthdayMonth : null,
      birthdayDay:
        typeof body.birthdayDay === 'number' ? body.birthdayDay : null,
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
    @Query('userStableId') userStableIdFromQuery?: string,
    @Query('userId') legacyUserIdFromQuery?: string,
  ) {
    const userStableId = this.resolveUserStableId(req, {
      queryUserStableId: userStableIdFromQuery ?? legacyUserIdFromQuery,
    });
    return this.membership.listCoupons({ userStableId });
  }

  @Get('addresses')
  async listAddresses(
    @Req() req: AuthedRequest,
    @Query('userStableId') userStableIdFromQuery?: string,
    @Query('userId') legacyUserIdFromQuery?: string,
  ) {
    const userStableId = this.resolveUserStableId(req, {
      queryUserStableId: userStableIdFromQuery ?? legacyUserIdFromQuery,
    });
    return this.membership.listAddresses({ userStableId });
  }

  @Post('addresses')
  async createAddress(
    @Req() req: AuthedRequest,
    @Body()
    body: {
      userStableId?: string;
      userId?: string;
      label?: string;
      receiver?: string;
      phone?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      province?: string;
      postalCode?: string;
      isDefault?: boolean;
    },
  ) {
    const userStableId = this.resolveUserStableId(req, {
      bodyUserStableId: body.userStableId ?? body.userId,
    });

    if (
      !body.receiver ||
      !body.addressLine1 ||
      !body.city ||
      !body.province ||
      !body.postalCode
    ) {
      throw new BadRequestException('address fields are required');
    }

    const created = await this.membership.createAddress({
      userStableId,
      label: body.label ?? 'Address',
      receiver: body.receiver,
      phone: body.phone ?? null,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2 ?? null,
      city: body.city,
      province: body.province,
      postalCode: body.postalCode,
      isDefault: body.isDefault ?? false,
    });

    return {
      success: true,
      address: created,
    };
  }

  @Post('addresses/default')
  async setDefaultAddress(
    @Req() req: AuthedRequest,
    @Body()
    body: { userStableId?: string; userId?: string; addressStableId?: string },
  ) {
    const userStableId = this.resolveUserStableId(req, {
      bodyUserStableId: body.userStableId ?? body.userId,
    });
    if (!body.addressStableId) {
      throw new BadRequestException('addressStableId is required');
    }
    return this.membership.setDefaultAddress({
      userStableId,
      addressStableId: body.addressStableId,
    });
  }

  @Delete('addresses')
  async deleteAddress(
    @Req() req: AuthedRequest,
    @Query('userStableId') userStableIdFromQuery?: string,
    @Query('userId') legacyUserIdFromQuery?: string,
    @Query('addressStableId') addressStableId?: string,
  ) {
    const userStableId = this.resolveUserStableId(req, {
      queryUserStableId: userStableIdFromQuery ?? legacyUserIdFromQuery,
    });
    if (!addressStableId) {
      throw new BadRequestException('addressStableId is required');
    }
    return this.membership.deleteAddress({ userStableId, addressStableId });
  }
}
