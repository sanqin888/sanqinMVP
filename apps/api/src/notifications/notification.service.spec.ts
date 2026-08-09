import type { User } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { NotificationService } from './notification.service';

jest.mock('@prisma/client', () => ({
  PrismaClient: class PrismaClient {},
  MessagingTemplateType: {
    SIGNUP_WELCOME: 'SIGNUP_WELCOME',
    ORDER_READY: 'ORDER_READY',
    SUBSCRIPTION_CONFIRM: 'SUBSCRIPTION_CONFIRM',
  },
}));

type SmsRenderInput = {
  locale: string;
  vars: {
    giftName: string;
  };
};

describe('NotificationService.notifyCouponIssued', () => {
  const templateRenderer = {
    renderEmail: jest.fn(),
    renderSms: jest.fn<Promise<string>, [SmsRenderInput]>(),
  };
  const emailService = {
    sendEmail: jest.fn(),
  };
  const smsService = {
    sendSms: jest.fn(),
  };
  const businessConfigService = {
    getMessagingSnapshot: jest
      .fn()
      .mockResolvedValue({ baseVars: { storeName: 'SanQin' } }),
  };

  const service = new NotificationService(
    emailService as never,
    smsService as never,
    templateRenderer as never,
    businessConfigService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    templateRenderer.renderSms.mockResolvedValue('rendered sms');
    smsService.sendSms.mockResolvedValue({ ok: true, sendId: 'sid' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses english gift title for english users when both localized titles are available', async () => {
    const user = {
      id: 'u_1',
      language: 'EN',
      phone: '+15551234567',
      email: null,
      firstName: 'John',
      lastName: 'Doe',
    } as unknown as User;

    await service.notifyCouponIssued({
      user,
      program: {
        tittleCh: '新人礼包',
        tittleEn: 'Welcome Gift',
        programStableId: 'prog_1',
        giftValue: '50',
        triggerType: 'SIGNUP_COMPLETED',
      },
    });

    expect(templateRenderer.renderSms).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'en',
      }),
    );

    const [payload] = templateRenderer.renderSms.mock.calls[0];
    expect(payload.vars.giftName).toBe('Welcome Gift');
  });

  it('order ready 有邮箱和电话时只发送邮件', async () => {
    templateRenderer.renderEmail.mockResolvedValue({
      subject: 'Ready',
      html: '<p>Ready</p>',
      text: 'Ready',
    });
    emailService.sendEmail.mockResolvedValue({ ok: true });

    await service.notifyOrderReady({
      email: 'order@example.com',
      phone: '+14165550000',
      orderNumber: 'SQ001',
    });

    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(templateRenderer.renderSms).not.toHaveBeenCalled();
  });

  it('order ready 没有邮箱时使用短信兜底', async () => {
    await service.notifyOrderReady({
      email: null,
      phone: '+14165550000',
      orderNumber: 'SQ002',
    });

    expect(smsService.sendSms).toHaveBeenCalledTimes(1);
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('order ready 邮件返回失败时改发短信并记录兜底原因', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    templateRenderer.renderEmail.mockResolvedValue({
      subject: 'Ready',
      html: '<p>Ready</p>',
      text: 'Ready',
    });
    emailService.sendEmail.mockResolvedValue({
      ok: false,
      error: 'suppressed:bounce',
    });

    const result = await service.notifyOrderReady({
      email: 'order@example.com',
      phone: '+14165550000',
      orderNumber: 'SQ003',
    });

    expect(smsService.sendSms).toHaveBeenCalledTimes(1);
    const [smsPayload] = smsService.sendSms.mock.calls[0] as [
      { metadata?: Record<string, string> },
    ];
    expect(smsPayload.metadata).toMatchObject({
      fallbackFrom: 'email',
      fallbackReason: 'suppressed:bounce',
    });
    expect(result).toMatchObject({
      ok: true,
      finalChannel: 'sms',
      attemptedChannels: ['email', 'sms'],
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'email failed; attempting SMS fallback reason=suppressed:bounce',
      ),
    );
  });

  it('order ready 邮件抛出异常时仍改发短信', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    templateRenderer.renderEmail.mockResolvedValue({
      subject: 'Ready',
      html: '<p>Ready</p>',
      text: 'Ready',
    });
    emailService.sendEmail.mockRejectedValue(new Error('provider unavailable'));

    await service.notifyOrderReady({
      email: 'order@example.com',
      phone: '+14165550000',
      orderNumber: 'SQ004',
    });

    expect(smsService.sendSms).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'email threw; attempting SMS fallback reason=provider unavailable',
      ),
    );
  });

  it('order ready 没有可信联系方式时返回结构化跳过结果', async () => {
    const result = await service.notifyOrderReady({
      email: null,
      phone: null,
      orderNumber: 'SQ005',
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'no_verified_contact',
      finalChannel: null,
      attemptedChannels: [],
    });
    expect(emailService.sendEmail).not.toHaveBeenCalled();
    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it('邮件失败且短信也失败时返回两个渠道均已尝试', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    templateRenderer.renderEmail.mockResolvedValue({
      subject: 'Ready',
      html: '<p>Ready</p>',
      text: 'Ready',
    });
    emailService.sendEmail.mockResolvedValue({
      ok: false,
      error: 'email unavailable',
    });
    smsService.sendSms.mockResolvedValue({
      ok: false,
      error: 'sms unavailable',
      sendId: 'sid-failed',
    });

    const result = await service.notifyOrderReady({
      email: 'order@example.com',
      phone: '+14165550000',
      orderNumber: 'SQ006',
    });

    expect(result).toMatchObject({
      ok: false,
      finalChannel: null,
      attemptedChannels: ['email', 'sms'],
      fallbackReason: 'email unavailable',
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'email failed; attempting SMS fallback reason=email unavailable',
      ),
    );
  });
});
