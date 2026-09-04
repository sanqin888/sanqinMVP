import { Injectable } from '@nestjs/common';
import { MessagingTemplateType } from '@prisma/client';

import { SmsService } from '../sms/sms.service';
import { BusinessConfigService } from './business-config.service';
import type {
  PhoneVerificationDeliveryInput,
  PhoneVerificationDeliveryPort,
  PhoneVerificationDeliveryResult,
} from './contracts/phone-verification-delivery.contract';
import { TemplateRenderer } from './template-renderer';

@Injectable()
export class PhoneVerificationDeliveryService implements PhoneVerificationDeliveryPort {
  constructor(
    private readonly smsService: SmsService,
    private readonly templateRenderer: TemplateRenderer,
    private readonly businessConfigService: BusinessConfigService,
  ) {}

  async sendVerificationSms(
    input: PhoneVerificationDeliveryInput,
  ): Promise<PhoneVerificationDeliveryResult> {
    const { baseVars } = await this.businessConfigService.getMessagingSnapshot(
      input.locale,
    );
    const message = await this.templateRenderer.renderSms({
      template: 'otp',
      locale: input.locale,
      vars: {
        ...baseVars,
        code: input.code,
        expiresInMin: input.expiresInMin,
        purpose: 'verify',
      },
    });
    const result = await this.smsService.sendSms({
      phone: input.phone,
      body: message,
      templateType: MessagingTemplateType.OTP,
      locale: input.locale,
      metadata: { purpose: input.purpose },
    });

    return {
      ok: result.ok,
      sendId: result.sendId,
      ...(result.error !== undefined ? { error: result.error } : {}),
    };
  }
}
