import { MessagingTemplateType } from '@prisma/client';

import { PhoneVerificationDeliveryService } from './phone-verification-delivery.service';

describe('PhoneVerificationDeliveryService characterization', () => {
  const createService = () => {
    const smsService = { sendSms: jest.fn() };
    const templateRenderer = { renderSms: jest.fn() };
    const businessConfigService = {
      getMessagingSnapshot: jest.fn().mockResolvedValue({
        baseVars: {
          brandName: 'SanQ',
          siteUrl: 'https://sanq.ca',
          supportEmail: 'support@sanq.ca',
          smsSignature: 'SanQ',
        },
      }),
    };
    const service = new PhoneVerificationDeliveryService(
      smsService as never,
      templateRenderer as never,
      businessConfigService as never,
    );

    return {
      service,
      smsService,
      templateRenderer,
      businessConfigService,
    };
  };

  it('keeps the verification template purpose while forwarding caller purpose as metadata', async () => {
    const { service, smsService, templateRenderer, businessConfigService } =
      createService();
    templateRenderer.renderSms.mockResolvedValue('verification message');
    smsService.sendSms.mockResolvedValue({ ok: true, sendId: 'send-1' });

    await expect(
      service.sendVerificationSms({
        phone: '14165550100',
        code: '100000',
        expiresInMin: 10,
        locale: 'en',
        purpose: 'checkout',
      }),
    ).resolves.toEqual({ ok: true, sendId: 'send-1' });

    expect(businessConfigService.getMessagingSnapshot).toHaveBeenCalledWith(
      'en',
    );
    expect(templateRenderer.renderSms).toHaveBeenCalledWith({
      template: 'otp',
      locale: 'en',
      vars: {
        brandName: 'SanQ',
        siteUrl: 'https://sanq.ca',
        supportEmail: 'support@sanq.ca',
        smsSignature: 'SanQ',
        code: '100000',
        expiresInMin: 10,
        purpose: 'verify',
      },
    });
    expect(smsService.sendSms).toHaveBeenCalledWith({
      phone: '14165550100',
      body: 'verification message',
      templateType: MessagingTemplateType.OTP,
      locale: 'en',
      metadata: { purpose: 'checkout' },
    });
  });

  it('preserves provider failure details for the Identity owner', async () => {
    const { service, smsService, templateRenderer } = createService();
    templateRenderer.renderSms.mockResolvedValue('verification message');
    smsService.sendSms.mockResolvedValue({
      ok: false,
      error: 'suppressed',
      sendId: 'send-failed',
    });

    await expect(
      service.sendVerificationSms({
        phone: '14165550100',
        code: '100000',
        expiresInMin: 10,
        purpose: 'membership-bind',
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'suppressed',
      sendId: 'send-failed',
    });
  });
});
