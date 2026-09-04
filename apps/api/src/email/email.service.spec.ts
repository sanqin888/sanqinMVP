import { MessagingTemplateType } from '@prisma/client';
import { EmailService } from './email.service';

describe('EmailService stable user identity', () => {
  it('resolves the MessagingSend user relation from userStableId', async () => {
    const provider = {
      sendEmail: jest
        .fn()
        .mockResolvedValue({ ok: true, messageId: 'provider-1' }),
    };
    const businessConfigService = {
      getMessagingSnapshot: jest.fn().mockResolvedValue({
        emailFromName: 'SanQ',
        emailFromAddress: 'noreply@sanq.ca',
      }),
    };
    const messagingSendCreate = jest
      .fn<
        Promise<{ id: string }>,
        [{ data: { user?: { connect: { userStableId: string } } } }]
      >()
      .mockResolvedValue({ id: 'send-1' });
    const prisma = {
      messagingSend: {
        create: messagingSendCreate,
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new EmailService(
      provider as never,
      businessConfigService as never,
      prisma as never,
    );

    await expect(
      service.sendEmail({
        to: 'john@example.com',
        subject: 'Gift',
        text: 'Gift',
        templateType: MessagingTemplateType.SIGNUP_WELCOME,
        userStableId: 'customer-stable-1',
        skipSuppression: true,
      }),
    ).resolves.toMatchObject({ ok: true, sendId: 'send-1' });

    const [createInput] = messagingSendCreate.mock.calls[0];
    expect(createInput.data.user).toEqual({
      connect: { userStableId: 'customer-stable-1' },
    });
  });
});

describe('EmailService member recharge verification email', () => {
  const createService = () =>
    new EmailService({} as never, {} as never, {} as never);

  it('keeps the English recharge OTP content and stable user identity', async () => {
    const service = createService();
    const sendEmail = jest.spyOn(service, 'sendEmail').mockResolvedValue({
      ok: true,
      sendId: 'send-1',
    });

    await expect(
      service.sendMemberRechargeVerificationEmail({
        to: 'member@example.com',
        code: '100000',
        expiresInMin: 10,
        locale: 'en',
        userStableId: 'member-stable-id',
      }),
    ).resolves.toEqual({ ok: true, sendId: 'send-1' });

    expect(sendEmail).toHaveBeenCalledWith({
      to: 'member@example.com',
      subject: 'POS recharge verification code',
      text: 'Your member recharge verification code is 100000. It expires in 10 minutes.',
      html: '<p>Your member recharge verification code is <strong>100000</strong></p><p>It expires in 10 minutes.</p>',
      locale: 'en',
      templateType: MessagingTemplateType.OTP,
      tags: { type: 'pos_recharge_otp' },
      userStableId: 'member-stable-id',
    });
  });

  it('keeps the Chinese recharge OTP content', async () => {
    const service = createService();
    const sendEmail = jest.spyOn(service, 'sendEmail').mockResolvedValue({
      ok: true,
      sendId: 'send-zh',
    });

    await service.sendMemberRechargeVerificationEmail({
      to: 'member@example.com',
      code: '123456',
      expiresInMin: 10,
      locale: 'zh-CN',
      userStableId: 'member-stable-id',
    });

    expect(sendEmail).toHaveBeenCalledWith({
      to: 'member@example.com',
      subject: 'POS会员充值验证码',
      text: '您的会员充值验证码：123456。10分钟内有效。',
      html: '<p>您的会员充值验证码：<strong>123456</strong></p><p>10分钟内有效。</p>',
      locale: 'zh-CN',
      templateType: MessagingTemplateType.OTP,
      tags: { type: 'pos_recharge_otp' },
      userStableId: 'member-stable-id',
    });
  });
});
