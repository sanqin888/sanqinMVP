//apps/api/src/admin/pos-devices/dto/create-pos-device.dto.ts
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePosDeviceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUUID()
  @IsOptional()
  storeId?: string; // 如果不填，Service 层可以给一个默认值
}