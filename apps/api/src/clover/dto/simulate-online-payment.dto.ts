// apps/api/src/clover/dto/simulate-online-payment.dto.ts
import { IsIn, IsOptional, IsUUID, IsString, ValidateIf, Matches } from 'class-validator';

export class SimulateOnlinePaymentDto {
  @ValidateIf((o: SimulateOnlinePaymentDto) => !o.referenceId)
  @IsOptional()
  @IsUUID()
  checkoutSessionId?: string;

  @ValidateIf((o: SimulateOnlinePaymentDto) => !o.checkoutSessionId)
  @IsOptional()
  @IsString()
  // 按你截图的格式 SQD + 10位数字，可按实际规则调整
  @Matches(/^SQD\d+$/, { message: 'referenceId format invalid' })
  referenceId?: string;

  @IsOptional()
  @IsIn(['SUCCESS', 'FAILURE'])
  result?: 'SUCCESS' | 'FAILURE';
}
