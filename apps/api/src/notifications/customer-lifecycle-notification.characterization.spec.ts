import { MessagingTemplateType } from '@prisma/client';
import { NotificationService } from './notification.service';

describe('Customer lifecycle notification characterization', () => {
  const originalPublicBaseUrl = process.env.PUBLIC_BASE_URL;

  const createService = () => {
    const emailService = { sendEmail: jest.fn() };
    const smsService = { sendSms: jest.fn() };
    const templateRenderer = {
      renderEmail: jest.fn().mockResolvedValue({
        subject: 'Rendered subject',
        html: '<p>Rendered</p>',
        text: 'Rendered',
      }),
      renderSms: jest.fn().mockResolvedValue('Rendered SMS'),
    };
    const businessConfigService = {
      getMessagingSnapshot: jest.fn().mockResolvedValue({
        baseVars: { storeName: 'SanQ' },
      }),
    };
    const service = new NotificationService(
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
    };
  };

  beforeEach(() => {
    process.env.PUBLIC_BASE_URL = 'https://sanq.example';
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (originalPublicBaseUrl === undefined) {
      delete process.env.PUBLIC_BASE_URL;
    } else {
      process.env.PUBLIC_BASE_URL = originalPublicBaseUrl;
    }
  });

  it('uses stable identity for registration welcome email', async () => {
    const { service, emailService, smsService, templateRenderer } =
      createService();
    emailService.sendEmail.mockResolvedValue({
      ok: true,
      sendId: 'email-send-1',
    });

    await service.notifyRegistrationWelcome({
      userStableId: 'customer-stable-1',
      email: 'member@example.com',
      phone: '+14165550100',
      firstName: 'San',
      lastName: 'Qin',
      language: 'EN',
    });

    expect(templateRenderer.renderEmail).toHaveBeenCalledWith({
      template: 'welcome',
      locale: 'en',
      vars: {
        storeName: 'SanQ',
        userName: 'San Qin',
        claimUrl: 'https://sanq.example/en/membership/login',
      },
    });
    expect(emailService.sendEmail).toHaveBeenCalledWith({
      to: 'member@example.com',
      subject: 'Rendered subject',
      html: '<p>Rendered</p>',
      text: 'Rendered',
      tags: { type: 'register_welcome' },
      locale: 'en',
      templateType: MessagingTemplateType.SIGNUP_WELCOME,
      userStableId: 'customer-stable-1',
      metadata: { trigger: 'register' },
    });
    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it('keeps registration email-to-SMS fallback on stable identity', async () => {
    const { service, emailService, smsService } = createService();
    emailService.sendEmail.mockResolvedValue({
      ok: false,
      error: 'suppressed:bounce',
      sendId: 'email-send-failed',
    });
    smsService.sendSms.mockResolvedValue({
      ok: true,
      sendId: 'sms-send-1',
    });

    await service.notifyRegistrationWelcome({
      userStableId: 'customer-stable-1',
      email: 'member@example.com',
      phone: '+14165550100',
      firstName: null,
      lastName: null,
      language: 'ZH',
    });

    expect(smsService.sendSms).toHaveBeenCalledWith({
      phone: '+14165550100',
      body: 'Rendered SMS',
      templateType: MessagingTemplateType.SIGNUP_WELCOME,
      locale: 'zh',
      userStableId: 'customer-stable-1',
      metadata: {
        trigger: 'register',
        fallbackFrom: 'email',
        fallbackReason: 'suppressed:bounce',
      },
    });
  });

  it('keeps subscription template mapping and stable linkage', async () => {
    const { service, emailService, templateRenderer } = createService();
    emailService.sendEmail.mockResolvedValue({
      ok: true,
      sendId: 'email-send-1',
    });

    await service.notifySubscriptionWelcome({
      userStableId: 'customer-stable-1',
      email: 'member@example.com',
      firstName: 'San',
      lastName: 'Qin',
      language: 'EN',
    });

    expect(templateRenderer.renderEmail).toHaveBeenCalledWith({
      template: 'Subscription',
      locale: 'en',
      vars: {
        storeName: 'SanQ',
        userName: 'San Qin',
        manageUrl: 'https://sanq.example/en/membership',
      },
    });
    expect(emailService.sendEmail).toHaveBeenCalledWith({
      to: 'member@example.com',
      subject: 'Rendered subject',
      html: '<p>Rendered</p>',
      text: 'Rendered',
      tags: { type: 'welcome' },
      locale: 'en',
      templateType: MessagingTemplateType.SUBSCRIPTION_CONFIRM,
      userStableId: 'customer-stable-1',
      metadata: { trigger: 'marketing_opt_in' },
    });
  });
});
