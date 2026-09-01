//apps/api/src/admin/pos-devices/dto/create-pos-device.dto.ts
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePosDeviceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  storeStableId?: string;

  // @compat pos-device.admin-db-id.v1
  @IsUUID()
  @IsOptional()
  storeId?: string;
}
