import {
  Controller,
  Get,
  Head,
  HttpCode,
  Post,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { UberReadOnlyAdmin } from './ubereats-access.decorator';

import { ReceiveUberWebhookUseCase } from '../application/orders/uber-webhook-receiver.use-case';
import { presentWebhookHealth } from './webhook.presenter';
import { UberValidationError } from '../application/shared/uber-application.error';
import { UberEatsExceptionFilter } from './ubereats-exception.filter';

@Controller('integrations/ubereats')
@UseFilters(UberEatsExceptionFilter)
export class UberEatsWebhookController {
  constructor(private readonly webhookService: ReceiveUberWebhookUseCase) {}
  @Get('webhook')
  @UberReadOnlyAdmin()
  health(@Res() res: Response) {
    return res.status(200).json(presentWebhookHealth());
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
      throw new UberValidationError({
        code: 'UBER_WEBHOOK_RAW_BODY_REQUIRED',
        message: 'Uber webhook raw body 不可用',
        operation: 'webhook.receive',
      });
    }
    await this.webhookService.execute({
      headers: req.headers,
      rawBody: req.body,
    });

    return presentWebhookHealth();
  }
}
