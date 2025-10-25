import { Controller, Post, Req, Res, Headers, HttpCode } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';

@Controller('api/webhooks') // 最终路由：/api/webhooks/clover-hco
export class CloverHcoWebhookController {
  @Post('clover-hco')
  @HttpCode(200)
  handle(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('clover-signature') sig?: string,
  ) {
    // 读取原始报文（HCO 签名校验需要原文）
    const raw = (req as any).rawBody?.toString?.() ?? JSON.stringify(req.body ?? {});
    const secret = process.env.CLOVER_HCO_SIGNING_SECRET || '';

    // 可选：校验签名（建议线上开启）
    if (secret) {
      const mac = createHmac('sha256', secret).update(raw).digest('hex');
      const got = sig ?? '';
      if (mac.length !== got.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(got))) {
        console.error('Invalid HCO signature', { expected: mac, got });
        return res.status(401).send('invalid signature');
      }
    }

    console.log('HCO webhook headers:', req.headers);
    console.log('HCO webhook body:', raw);
    return res.send('ok');
  }
}
