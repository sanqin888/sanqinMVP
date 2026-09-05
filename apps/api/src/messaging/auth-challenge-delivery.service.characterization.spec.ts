import { MessagingTemplateType } from '@prisma/client';

import { AuthChallengeDeliveryService } from './auth-challenge-delivery.service';

describe('AuthChallengeDeliveryService characterization', () => {
  const createService = () => {
    const emailService = { sendEmail: jest.fn() };
    const smsService = { sendSms: jest.fn() };
    const templateRenderer = {
      renderEmail: jest.fn(),
      renderSms: jest.fn(),
    };
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
    const service = new AuthChallengeDeliveryService(
      emailService as never,
      smsService as never,
      templateRenderer as never,
      businessConfigService as never,
    );

    return {
      service,
      emailService,
      smsService,
      templateRenderer,
      businessConfigService,
    };
  };

  it('renders and sends login 2FA SMS with stable user identity', async () => {
    const { service, smsService, templateRenderer, businessConfigService } =
      createService();
    templateRenderer.renderSms.mockResolvedValue('2FA message');
    smsService.sendSms.mockResolvedValue({ ok: true, sendId: 'send-sms-2fa' });

    await expect(
      service.sendLoginTwoFactorSms({
        phone: '+14165550100',
        code: '000042',
        expiresInMin: 5,
        locale: 'en',
        userStableId: 'c1234567890abcdefghijklmn',
      }),
    ).resolves.toEqual({ ok: true, sendId: 'send-sms-2fa', error: undefined });

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
        code: '000042',
        expiresInMin: 5,
        purpose: 'login_2fa',
      },
    });
    expect(smsService.sendSms).toHaveBeenCalledWith({
      phone: '+14165550100',
      body: '2FA message',
      templateType: MessagingTemplateType.OTP,
      locale: 'en',
      userStableId: 'c1234567890abcdefghijklmn',
      metadata: { purpose: 'login_2fa' },
    });
  });

  it('renders and sends admin login 2FA email with stable user identity', async () => {
    const { service, emailService, templateRenderer } = createService();
    templateRenderer.renderEmail.mockResolvedValue({
      subject: 'subject',
      html: '<p>code</p>',
      text: 'code',
    });
    emailService.sendEmail.mockResolvedValue({
      ok: true,
      sendId: 'send-email-2fa',
    });

    await expect(
      service.sendLoginTwoFactorEmail({
        email: 'admin@example.com',
        code: '000042',
        expiresInMin: 5,
        locale: 'zh-CN',
        userStableId: 'c1234567890abcdefghijklmn',
      }),
    ).resolves.toEqual({ ok: true, sendId: 'send-email-2fa', error: undefined });

    expect(templateRenderer.renderEmail).toHaveBeenCalledWith({
      template: 'otp',
      locale: 'zh-CN',
      vars: {
        brandName: 'SanQ',
        siteUrl: 'https://sanq.ca',
        supportEmail: 'support@sanq.ca',
        smsSignature: 'SanQ',
        code: '000042',
        expiresInMin: 5,
        purpose: 'admin_login',
      },
    });
    expect(emailService.sendEmail).toHaveBeenCalledWith({
      to: 'admin@example.com',
      subject: 'subject',
      text: 'code',
      html: '<p>code</p>',
      tags: { type: 'admin_login_2fa' },
      locale: 'zh-CN',
      templateType: MessagingTemplateType.OTP,
      userStableId: 'c1234567890abcdefghijklmn',
      metadata: { purpose: 'admin_login' },
    });
  });

  it('keeps phone enrollment and membership-login SMS purposes distinct', async () => {
    const { service, smsService, templateRenderer } = createService();
    templateRenderer.renderSms
      .mockResolvedValueOnce('verify message')
      .mockResolvedValueOnce('login message');
    smsService.sendSms
      .mockResolvedValueOnce({ ok: true, sendId: 'send-verify' })
      .mockResolvedValueOnce({ ok: true, sendId: 'send-login' });

    await expect(
      service.sendPhoneEnrollmentSms({
        phone: '4165550100',
        code: '123456',
        expiresInMin: 5,
        locale: 'en',
        userStableId: 'c1234567890abcdefghijklmn',
      }),
    ).resolves.toEqual({ ok: true, sendId: 'send-verify', error: undefined });
    await expect(
      service.sendMembershipLoginSms({
        phone: '4165550100',
        code: '654321',
        expiresInMin: 5,
        locale: 'en',
      }),
    ).resolves.toEqual({ ok: true, sendId: 'send-login', error: undefined });

    expect(smsService.sendSms).toHaveBeenNthCalledWith(1, {
      phone: '4165550100',
      body: 'verify message',
      templateType: MessagingTemplateType.OTP,
      locale: 'en',
      userStableId: 'c1234567890abcdefghijklmn',
      metadata: { purpose: 'verify' },
    });
    expect(smsService.sendSms).toHaveBeenNthCalledWith(2, {
      phone: '4165550100',
      body: 'login message',
      templateType: MessagingTemplateType.OTP,
      locale: 'en',
      metadata: { purpose: 'login' },
    });
  });
});
