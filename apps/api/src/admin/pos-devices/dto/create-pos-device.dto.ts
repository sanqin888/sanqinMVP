//apps/api/src/admin/pos-devices/dto/create-pos-device.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePosDeviceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  storeStableId: string;
}
