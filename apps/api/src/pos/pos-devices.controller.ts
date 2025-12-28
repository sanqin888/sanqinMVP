import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PosDeviceService } from './pos-device.service';
import {
  POS_DEVICE_COOKIE_MAX_AGE_DAYS,
  POS_DEVICE_ID_COOKIE,
  POS_DEVICE_KEY_COOKIE,
} from './pos-device.constants';

@Controller('pos/devices')
export class PosDevicesController {
  constructor(private readonly posDeviceService: PosDeviceService) {}

  @Post('claim')
  async claimDevice(
    @Body() body: { enrollmentCode?: string; meta?: unknown },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userAgent = req.headers['user-agent'];
    const result = await this.posDeviceService.claimDevice({
      enrollmentCode: body?.enrollmentCode ?? '',
      meta: body?.meta,
      userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    });

    const maxAge = POS_DEVICE_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

    res.cookie(POS_DEVICE_ID_COOKIE, result.device.deviceStableId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge,
      path: '/',
    });

    res.cookie(POS_DEVICE_KEY_COOKIE, result.deviceKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge,
      path: '/',
    });

    return { success: true, deviceStableId: result.device.deviceStableId };
  }
}
