import type { User } from '@prisma/client';
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
});
