import { IsIn, IsOptional } from 'class-validator';
import { IsStableId } from '../../common/validators/is-stable-id.validator';

export class SimulateOnlinePaymentDto {
  @IsStableId({ message: 'orderId must be cuid/uuid' })
  orderId!: string;

  @IsOptional()
  @IsIn(['SUCCESS', 'FAILURE'])
  result?: 'SUCCESS' | 'FAILURE';
}
