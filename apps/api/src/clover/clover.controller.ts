//Users/apple/sanqinMVP/apps/api/src/clover/clover.controller.ts
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

type MarkPaidDto = { clientRequestId: string };
type GetOrderParam = { clientRequestId: string };
type StatusQuery = { ref?: string };

@Controller('clover')
export class CloverController {
  constructor() {}

  @Post('mark-paid')
  markPaid(@Body() dto: MarkPaidDto) {
    const { clientRequestId } = dto;
    return {
      ok: true as const,
      markedPaid: true as const,
      clientRequestId,
      orderNumber: clientRequestId,
    };
  }

  @Get('orders/:clientRequestId')
  getOrder(@Param() params: GetOrderParam) {
    const { clientRequestId } = params;
    return { clientRequestId, orderNumber: clientRequestId };
  }

  @Get('status')
  getStatus(@Query() q: StatusQuery) {
    const ref = q.ref ?? '';
    return { ref };
  }
}
