import { IsIn } from 'class-validator';

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'making'
  | 'ready'
  | 'completed';

export class UpdateOrderStatusDto {
  @IsIn(['pending', 'paid', 'making', 'ready', 'completed'])
  status!: OrderStatus;
}
