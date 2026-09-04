import { Injectable } from '@nestjs/common';

import type {
  MemberRechargeEmailDeliveryInput,
  MemberRechargeEmailDeliveryPort,
  MemberRechargeEmailDeliveryResult,
} from './contracts/member-recharge-email-delivery.contract';
import { EmailService } from './email.service';

@Injectable()
export class MemberRechargeEmailDeliveryService implements MemberRechargeEmailDeliveryPort {
  constructor(private readonly emailService: EmailService) {}

  async sendRechargeVerificationEmail(
    input: MemberRechargeEmailDeliveryInput,
  ): Promise<MemberRechargeEmailDeliveryResult> {
    const result =
      await this.emailService.sendMemberRechargeVerificationEmail(input);
    return {
      ok: result.ok,
      sendId: result.sendId,
      ...(result.error !== undefined ? { error: result.error } : {}),
    };
  }
}
