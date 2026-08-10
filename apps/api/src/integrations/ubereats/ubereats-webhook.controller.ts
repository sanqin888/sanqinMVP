import {
  BadRequestException,
  Controller,
  Get,
  Head,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AppLogger } from '../../common/app-logger';

import { UberReadOnlyAdmin } from './ubereats-access.decorator';

import { UberWebhookService } from './uber-webhook.service';

@Controller('integrations/ubereats')
export class UberEatsWebhookController {
  private readonly logger = new AppLogger(UberEatsWebhookController.name);
  constructor(private readonly webhookService: UberWebhookService) {}
  private readRequestHeader(req: Request, name: string): string | null {
    const value = req.headers[name.toLowerCase()];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value))
      return value.find((item) => item.trim())?.trim() || null;
    return null;
  }
  @Get('webhook')
  @UberReadOnlyAdmin()
  health(@Res() res: Response) {
    return res.status(200).json({ ok: true });
  }

  @Head('webhook')
  @UberReadOnlyAdmin()
  head(@Res() res: Response) {
    return res.sendStatus(200);
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: Request) {
    if (!Buffer.isBuffer(req.body)) {
      throw new BadRequestException('Uber webhook raw body 不可用');
    }
    const rawBuffer = req.body;

    const rawBody = rawBuffer.toString('utf8');

    let parsedBody: unknown = null;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsedBody = null;
    }

    const body =
      parsedBody && typeof parsedBody === 'object'
        ? (parsedBody as Record<string, unknown>)
        : null;
    const requestId = this.readRequestHeader(req, 'x-request-id') ?? 'unknown';
    const eventType =
      typeof body?.event_type === 'string' ? body.event_type : 'unknown';
    const contentType =
      this.readRequestHeader(req, 'content-type') ?? 'unknown';
    this.logger.log(
      `[ubereats webhook] requestId=${requestId} eventType=${eventType} contentType=${contentType} bodyBytes=${rawBuffer.length}`,
    );

    await this.webhookService.handleWebhook({
      headers: req.headers as Record<string, unknown>,
      rawBody: rawBuffer,
    });

    return { ok: true };
  }
}
