//apps/api/src/admin/pos-devices/dto/update-pos-device-status.dto.ts
import { IsIn } from 'class-validator';
import type { PosDeviceManagementStatus } from '../../../pos/public-api';

export class UpdatePosDeviceStatusDto {
  @IsIn(['ACTIVE', 'DISABLED'])
  status: PosDeviceManagementStatus;
}
