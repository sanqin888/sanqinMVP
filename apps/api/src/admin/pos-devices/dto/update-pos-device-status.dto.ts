//apps/api/src/admin/pos-devices/dto/update-pos-device-status.dto.ts
import { IsEnum } from 'class-validator';
import { PosDeviceStatus } from '@prisma/client';

export class UpdatePosDeviceStatusDto {
  @IsEnum(PosDeviceStatus)
  status: PosDeviceStatus;
}
