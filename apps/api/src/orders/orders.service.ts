import { Injectable } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

@Injectable()
export class OrdersService {
  private orders: any[] = [];

  create(dto: CreateOrderDto) {
    const id = uuid();
    const pickupCode = Math.floor(1000 + Math.random() * 9000).toString();
    const now = new Date().toISOString();
    const record = { id, pickupCode, status: 'paid', createdAt: now, ...dto };
    this.orders.push(record);
    return record;
  }

  findOne(id: string) {
    return this.orders.find(o => o.id === id);
  }
}
