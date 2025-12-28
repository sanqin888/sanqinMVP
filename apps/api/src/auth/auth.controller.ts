// apps/api/src/auth/auth.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SessionAuthGuard, SESSION_COOKIE_NAME } from './session-auth.guard';
import {
  POS_DEVICE_ID_COOKIE,
  POS_DEVICE_KEY_COOKIE,
} from '../pos/pos-device.constants';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body()
    body: {
      email?: string;
      password?: string;
      purpose?: 'pos' | 'admin';
    },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const deviceInfo = req.headers['user-agent'];
    const deviceStableId = req.cookies?.[POS_DEVICE_ID_COOKIE];
    const deviceKey = req.cookies?.[POS_DEVICE_KEY_COOKIE];
    const result = await this.authService.loginWithPassword({
      email: body?.email ?? '',
      password: body?.password ?? '',
      purpose: body?.purpose,
      posDeviceStableId:
        typeof deviceStableId === 'string' ? deviceStableId : undefined,
      posDeviceKey: typeof deviceKey === 'string' ? deviceKey : undefined,
      deviceInfo: typeof deviceInfo === 'string' ? deviceInfo : undefined,
    });

    res.cookie(SESSION_COOKIE_NAME, result.session.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: result.session.expiresAt.getTime() - Date.now(),
      path: '/',
    });

    return {
      userStableId: result.user.userStableId,
      email: result.user.email,
      role: result.user.role,
      expiresAt: result.session.expiresAt,
    };
  }

  @Post('login/otp/request')
  async requestOtp(@Body() body: { phone?: string }) {
    return this.authService.requestLoginOtp({ phone: body?.phone ?? '' });
  }

  @Post('login/otp/verify')
  async verifyOtp(
    @Body() body: { phone?: string; code?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const deviceInfo = req.headers['user-agent'];
    const result = await this.authService.verifyLoginOtp({
      phone: body?.phone ?? '',
      code: body?.code ?? '',
      deviceInfo: typeof deviceInfo === 'string' ? deviceInfo : undefined,
    });

    res.cookie(SESSION_COOKIE_NAME, result.session.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: result.session.expiresAt.getTime() - Date.now(),
      path: '/',
    });

    return {
      success: true,
      userStableId: result.user.userStableId,
      role: result.user.role,
      verificationToken: result.verificationToken,
    };
  }

  @Post('accept-invite')
  async acceptInvite(
    @Body() body: { token?: string; password?: string; name?: string },
  ) {
    const result = await this.authService.acceptInvite({
      token: body?.token ?? '',
      password: body?.password ?? '',
      name: body?.name,
    });
    return {
      userStableId: result.user.userStableId,
      email: result.user.email,
      role: result.user.role,
    };
  }

  @UseGuards(SessionAuthGuard)
  @Get('me')
  me(
    @Req()
    req: Request & {
      user?: { userStableId: string; email?: string | null; role?: string };
    },
  ) {
    const user = req.user;
    if (!user) return null;
    return {
      userStableId: user.userStableId,
      email: user.email,
      role: user.role,
    };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieHeader = req.headers.cookie ?? '';
    const sessionId = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
      ?.split('=')[1];

    if (sessionId) {
      await this.authService.revokeSession(sessionId);
    }

    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { success: true };
  }
}
