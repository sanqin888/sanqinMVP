import {
  Body,
  Controller,
  Get,
  Head,
  Header,
  HttpCode,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { OrderStatus } from '@prisma/client';
import { AppLogger } from '../../common/app-logger';
import { UberEatsService } from './ubereats.service';

@Controller('integrations/ubereats')
export class UberEatsController {
  private readonly logger = new AppLogger(UberEatsController.name);

  constructor(private readonly uberEatsService: UberEatsService) {}

  @Get('oauth/callback')
  @Header('Content-Type', 'text/html; charset=utf-8')
  oauthCallback(@Query('code') code?: string, @Req() req?: Request) {
    this.logger.log(
      `[ubereats oauth callback] code=${code ?? 'missing'} query=${JSON.stringify(req?.query ?? {})}`,
    );

    return 'Authorized. You can close this window. (ok)';
  }

  // Uber/平台可达性探测：GET
  @Get('webhook')
  health(@Res() res: Response) {
    return res.status(200).json({ ok: true });
  }

  // 可达性探测：HEAD
  @Head('webhook')
  head(@Res() res: Response) {
    return res.sendStatus(200);
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: Request) {
    const rawBody = this.toRawBodyString(req.body);

    const result = await this.uberEatsService.handleWebhook({
      headers: req.headers,
      body: req.body,
      rawBody,
    });

    return { ok: true, ...result };
  }

  @Post('orders/:externalOrderId/status')
  async syncOrderStatus(
    @Param('externalOrderId') externalOrderId: string,
    @Body('status', new ParseEnumPipe(OrderStatus)) status: OrderStatus,
  ) {
    return this.uberEatsService.syncOrderStatusToUber(externalOrderId, status);
  }

  @Get('orders/pending')
  async listPendingOrders() {
    return this.uberEatsService.listPendingUberOrders();
  }

  @Post('store/status/sync')
  async syncStoreStatus() {
    return this.uberEatsService.syncStoreStatusToUber();
  }

  private toRawBodyString(body: unknown): string {
    if (typeof body === 'string') return body;
    if (Buffer.isBuffer(body)) return body.toString('utf8');
    if (body && typeof body === 'object') return JSON.stringify(body);
    return '';
  }
}
