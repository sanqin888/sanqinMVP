// apps/api/src/membership/membership.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { MembershipService } from './membership.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { MfaGuard } from '../auth/mfa.guard';

type AuthedRequest = Request & {
  user?: { id?: string; userStableId?: string };
  session?: { sessionId?: string };
};

@UseGuards(SessionAuthGuard, MfaGuard)
@Controller('membership')
export class MembershipController {
  constructor(private readonly membership: MembershipService) {}

  @Get('summary')
  async summary(
    @Req() req: AuthedRequest,
    @Query('name') name?: string,
    @Query('email') email?: string,
    @Query('referrerEmail') referrerEmail?: string,
    @Query('birthdayMonth') birthdayMonthRaw?: string,
    @Query('birthdayDay') birthdayDayRaw?: string,
  ) {
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
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
      userStableId,
      name: name ?? null,
      email: email ?? null,
      referrerEmail,
      birthdayMonth,
      birthdayDay,
    });
  }

  @Get('lookup-by-phone')
  async lookupByPhone(@Query('phone') phone?: string) {
    if (!phone) {
      throw new BadRequestException('phone is required');
    }
    return this.membership.getMemberByPhone(phone);
  }

  @Get('devices')
  async listDevices(@Req() req: AuthedRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    return this.membership.getDeviceManagement({
      userId,
      currentSessionId: req.session?.sessionId,
    });
  }

  @Delete('devices/sessions/:sessionId')
  async revokeSession(
    @Req() req: AuthedRequest,
    @Param('sessionId') sessionId?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    if (!sessionId) {
      throw new BadRequestException('sessionId is required');
    }

    await this.membership.revokeSession({ userId, sessionId });
    return { success: true };
  }

  @Delete('devices/trusted/:deviceId')
  async revokeTrustedDevice(
    @Req() req: AuthedRequest,
    @Param('deviceId') deviceId?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    if (!deviceId) {
      throw new BadRequestException('deviceId is required');
    }

    await this.membership.revokeTrustedDevice({ userId, deviceId });
    return { success: true };
  }

  // ✅ 积分流水
  @Get('loyalty-ledger')
  async loyaltyLedger(
    @Req() req: AuthedRequest,
    @Query('limit') limitRaw?: string,
  ) {
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }

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
      marketingEmailOptIn?: boolean;
    },
  ) {
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }
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
      name?: string | null;
      birthdayMonth?: number | null;
      birthdayDay?: number | null;
    },
  ) {
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }

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

  @Post('referrer')
  async bindReferrer(
    @Req() req: AuthedRequest,
    @Body() body: { referrerEmail?: string },
  ) {
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }
    const referrerEmail = body.referrerEmail ?? '';
    const result = await this.membership.bindReferrerEmail({
      userStableId,
      referrerEmail,
    });

    return {
      success: true,
      ...result,
    };
  }

  // ✅ 优惠券列表（会自动补发欢迎券 / 生日券）
  @Get('coupons')
  async listCoupons(@Req() req: AuthedRequest) {
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }
    return this.membership.listCoupons({ userStableId });
  }

  @Get('addresses')
  async listAddresses(@Req() req: AuthedRequest) {
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }
    return this.membership.listAddresses({ userStableId });
  }

  @Post('addresses')
  async createAddress(
    @Req() req: AuthedRequest,
    @Body()
    body: {
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
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }

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
    body: { addressStableId?: string },
  ) {
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }
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
    @Query('addressStableId') addressStableId?: string,
  ) {
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }
    if (!addressStableId) {
      throw new BadRequestException('addressStableId is required');
    }
    return this.membership.deleteAddress({ userStableId, addressStableId });
  }
}
