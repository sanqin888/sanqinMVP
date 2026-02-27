import {
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppLogger } from '../../common/app-logger';

@Controller('integrations/ubereats')
export class UberEatsController {
  private readonly logger = new AppLogger(UberEatsController.name);

  @Get('oauth/callback')
  @Header('Content-Type', 'text/html; charset=utf-8')
  oauthCallback(@Query('code') code?: string, @Req() req?: Request) {
    this.logger.log(
      `[ubereats oauth callback] code=${code ?? 'missing'} query=${JSON.stringify(req?.query ?? {})}`,
    );

    return 'Authorized. You can close this window. (ok)';
  }

  @Post('webhook')
  @HttpCode(200)
  webhook(@Req() req: Request) {
    const rawBody = this.toRawBodyString(req.body);

    this.logger.log(
      `[ubereats webhook] headers=${JSON.stringify(req.headers)} rawBody=${rawBody}`,
    );

    return { ok: true };
  }

  private toRawBodyString(body: unknown): string {
    if (typeof body === 'string') return body;
    if (Buffer.isBuffer(body)) return body.toString('utf8');
    if (body && typeof body === 'object') return JSON.stringify(body);
    return '';
  }
}
