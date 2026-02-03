//apps/api/src/sms/webhooks/twilio.webhooks.controller.ts
import { Controller, Post, Req, Res, HttpCode } from '@nestjs/common';
import type { Request, Response } from 'express';

function parseTwilioFormBody(req: Request): Record<string, string> {
  // 因为你对 /api/v1/webhooks/twilio 使用了 express.raw({ type: "*/*" })
  // 所以 req.body 是 Buffer（或 string），需要手动解析 x-www-form-urlencoded
  const raw = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : (req.body?.toString?.() ?? '');

  const params = new URLSearchParams(raw);
  const obj: Record<string, string> = {};
  for (const [k, v] of params.entries()) obj[k] = v;
  return obj;
}

@Controller('webhooks/twilio')
export class TwilioWebhooksController {
  // ✅ 入站短信（包含用户回复/STOP/HELP/START）
  @Post('sms/inbound')
  @HttpCode(200)
  inboundSms(@Req() req: Request, @Res() res: Response) {
    const body = parseTwilioFormBody(req);

    const from = body.From;
    const to = body.To;
    const text = body.Body;
    const sid = body.MessageSid;

    console.log('[twilio inbound sms]', { sid, from, to, text });

    // 不自动回复：返回空 TwiML
    res
      .type('text/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  }

  // ✅ 短信状态回执（你发出去的短信状态）
  @Post('sms/status')
  @HttpCode(200)
  smsStatus(@Req() req: Request, @Res() res: Response) {
    const body = parseTwilioFormBody(req);

    console.log('[twilio sms status]', {
      messageSid: body.MessageSid,
      status: body.MessageStatus, // queued/sent/delivered/failed/undelivered
      to: body.To,
      from: body.From,
      errorCode: body.ErrorCode,
      errorMessage: body.ErrorMessage,
    });

    res.send('ok');
  }

  // ✅ 关掉 voice：来电直接拒接
  @Post('voice/inbound')
  @HttpCode(200)
  inboundCall(@Res() res: Response) {
    res
      .type('text/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="rejected"/></Response>`,
      );
  }
}
