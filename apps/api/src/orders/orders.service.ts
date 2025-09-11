import { Injectable } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import type { Order } from './types';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

@Injectable()
export class OrdersService {
  create(dto: CreateOrderDto): Order {                 // ← 明确返回 Order
    const id = uuid();
    const pickupCode = Math.floor(Math.random() * 9000 + 1000).toString();

    const order: Order = {
      id,
      pickupCode,
      status: 'paid',
      createdAt: new Date().toISOString(),
      channel: dto.channel,
      items: dto.items.map((i) => ({
        productId: i.productId,
        qty: i.qty,
        options: i.options,
      })),
      subtotal: dto.subtotal,
      taxTotal: dto.taxTotal,
      total: dto.total,
      fulfillmentType: dto.fulfillmentType,
    };

    return order;
  }
}
