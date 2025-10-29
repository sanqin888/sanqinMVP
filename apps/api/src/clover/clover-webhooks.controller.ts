import { Controller, Post, Req, Res, Headers, HttpCode } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('webhooks') // 最终路由：/api/v1/webhooks/clover-hco
export class CloverHcoWebhookController {
  @Post('clover-hco')
  @HttpCode(200)
  handle(
    @Req() req: RawBodyRequest,
    @Res() res: Response,
    @Headers('clover-signature') sig?: string,
  ) {
    // 读取原始报文（HCO 签名校验需要原文）
    const rawBody = req.rawBody ?? null;
    const rawBuffer = rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const raw = rawBuffer.toString('utf8');
    const secret = process.env.CLOVER_HCO_SIGNING_SECRET || '';

    // 可选：校验签名（建议线上开启）
    if (secret) {
      const mac = createHmac('sha256', secret).update(rawBuffer).digest('hex');
      const got = sig ?? '';
      if (
        mac.length !== got.length ||
        !timingSafeEqual(Buffer.from(mac), Buffer.from(got))
      ) {
        console.error('Invalid HCO signature', { expected: mac, got });
        return res.status(401).send('invalid signature');
      }
    }

    console.log('HCO webhook headers:', req.headers);
    console.log('HCO webhook body:', raw);
    return res.send('ok');
  }
}
