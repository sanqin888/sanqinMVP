// apps/api/src/membership/membership.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { MembershipService } from './membership.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { MfaGuard } from '../auth/mfa.guard';
import { AuthService } from '../auth/auth.service';
import { TRUSTED_DEVICE_COOKIE } from '../auth/trusted-device.constants';

type AuthedRequest = Request & {
  user?: { id?: string; userStableId?: string };
  session?: { sessionId?: string };
};

@UseGuards(SessionAuthGuard, MfaGuard)
@Controller('membership')
export class MembershipController {
  constructor(
    private readonly membership: MembershipService,
    private readonly auth: AuthService,
  ) {}

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

  @Post('devices/trusted')
  async trustDevice(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
    @Body()
    body: {
      sessionId?: string;
      label?: string;
    },
  ) {
    const userId = req.user?.id;
    const currentSessionId = req.session?.sessionId;
    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    if (!body?.sessionId) {
      throw new BadRequestException('sessionId is required');
    }
    if (!currentSessionId || body.sessionId !== currentSessionId) {
      throw new BadRequestException('sessionId must be current');
    }

    const sessionLabel = await this.membership.getSessionDeviceLabel({
      userId,
      sessionId: body.sessionId,
    });
    const label = body.label?.trim() || sessionLabel.label;
    const trustedDevice = await this.auth.createTrustedDeviceForUser({
      userId,
      label,
    });

    const maxAge = trustedDevice.expiresAt.getTime() - Date.now();
    res.cookie(TRUSTED_DEVICE_COOKIE, trustedDevice.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge,
      path: '/',
    });

    return { success: true, trustedDevice };
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

  @Post('email/verification/request')
  async requestEmailVerification(
    @Req() req: AuthedRequest,
    @Body() body: { email?: string },
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const result = await this.membership.requestEmailVerification({
      userId,
      email: body.email,
    });

    return { success: true, ...result };
  }

  @Post('email/verification/confirm')
  async confirmEmailVerification(
    @Req() req: AuthedRequest,
    @Body() body: { code?: string },
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const result = await this.membership.verifyEmailCode({
      userId,
      code: body.code,
    });

    return { success: true, ...result };
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
      language?: string | null;
    },
  ) {
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }

    const normalizedLanguage =
      typeof body.language === 'string'
        ? body.language.trim().toLowerCase()
        : null;

    if (
      normalizedLanguage &&
      normalizedLanguage !== 'zh' &&
      normalizedLanguage !== 'en'
    ) {
      throw new BadRequestException('language must be zh or en');
    }

    const user = await this.membership.updateProfile({
      userStableId,
      name: body.name ?? null,
      birthdayMonth:
        typeof body.birthdayMonth === 'number' ? body.birthdayMonth : null,
      birthdayDay:
        typeof body.birthdayDay === 'number' ? body.birthdayDay : null,
      language: normalizedLanguage,
    });

    return {
      success: true,
      user,
    };
  }

  @Post('referrer')
  async bindReferrer(
    @Req() req: AuthedRequest,
    @Body() body: { referrerEmail?: string; referrerInput?: string },
  ) {
    const userStableId = req.user?.userStableId;
    if (!userStableId) {
      throw new BadRequestException('userStableId is required');
    }
    const referrerInput = body.referrerInput ?? body.referrerEmail ?? '';
    const result = await this.membership.bindReferrerEmail({
      userStableId,
      referrerInput,
    });

    return {
      success: true,
      ...result,
    };
  }

  // ✅ 优惠券列表
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
      remark?: string;
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
      remark: body.remark ?? null,
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

  @Put('addresses')
  async updateAddress(
    @Req() req: AuthedRequest,
    @Body()
    body: {
      addressStableId?: string;
      label?: string;
      receiver?: string;
      phone?: string;
      addressLine1?: string;
      addressLine2?: string;
      remark?: string;
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
      !body.addressStableId ||
      !body.receiver ||
      !body.addressLine1 ||
      !body.city ||
      !body.province ||
      !body.postalCode
    ) {
      throw new BadRequestException('address fields are required');
    }

    const updated = await this.membership.updateAddress({
      userStableId,
      addressStableId: body.addressStableId,
      label: body.label ?? 'Address',
      receiver: body.receiver,
      phone: body.phone ?? null,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2 ?? null,
      remark: body.remark ?? null,
      city: body.city,
      province: body.province,
      postalCode: body.postalCode,
      isDefault: body.isDefault ?? false,
    });

    return {
      success: true,
      address: updated,
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
