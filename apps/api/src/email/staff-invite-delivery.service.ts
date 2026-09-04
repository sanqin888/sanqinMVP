import { Injectable } from '@nestjs/common';

import type {
  StaffInviteDeliveryInput,
  StaffInviteDeliveryPort,
  StaffInviteDeliveryResult,
} from './contracts/staff-invite-delivery.contract';
import { EmailService } from './email.service';

@Injectable()
export class StaffInviteDeliveryService implements StaffInviteDeliveryPort {
  constructor(private readonly emailService: EmailService) {}

  async sendStaffInvite(
    input: StaffInviteDeliveryInput,
  ): Promise<StaffInviteDeliveryResult> {
    const result = await this.emailService.sendStaffInviteEmail(input);
    return {
      ok: result.ok,
      sendId: result.sendId,
      ...(result.error !== undefined ? { error: result.error } : {}),
    };
  }
}
