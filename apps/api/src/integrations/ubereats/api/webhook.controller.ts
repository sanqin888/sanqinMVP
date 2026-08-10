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

import { UberReadOnlyAdmin } from './ubereats-access.decorator';

import { ReceiveUberWebhookUseCase } from '../application/orders/uber-webhook-receiver.use-case';

@Controller('integrations/ubereats')
export class UberEatsWebhookController {
  constructor(private readonly webhookService: ReceiveUberWebhookUseCase) {}
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
    await this.webhookService.execute({
      headers: req.headers as Record<string, unknown>,
      rawBody: req.body,
    });

    return { ok: true };
  }
}
