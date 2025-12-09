//Users/apple/sanqinMVP/apps/api/src/clover/clover.controller.ts
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

type MarkPaidDto = { orderId: string };
type GetOrderParam = { id: string };
type StatusQuery = { ref?: string };

@Controller('clover')
export class CloverController {
  constructor() {}

  @Post('mark-paid')
  markPaid(@Body() dto: MarkPaidDto) {
    const { orderId } = dto;
    return { ok: true as const, markedPaid: true as const, orderId };
  }

  @Get('orders/:id')
  getOrder(@Param() params: GetOrderParam) {
    const { id } = params;
    return { id };
  }

  @Get('status')
  getStatus(@Query() q: StatusQuery) {
    const ref = q.ref ?? '';
    return { ref };
  }
}
