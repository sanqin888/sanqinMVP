import { MemberRechargeEmailDeliveryService } from './member-recharge-email-delivery.service';

describe('MemberRechargeEmailDeliveryService characterization', () => {
  it('forwards recharge verification facts', async () => {
    const emailService = { sendMemberRechargeVerificationEmail: jest.fn() };
    emailService.sendMemberRechargeVerificationEmail.mockResolvedValue({
      ok: true,
      sendId: 'send-1',
    });
    const service = new MemberRechargeEmailDeliveryService(
      emailService as never,
    );

    await expect(
      service.sendRechargeVerificationEmail({
        to: 'member@example.com',
        code: '100000',
        expiresInMin: 10,
        locale: 'en',
        userStableId: 'member-stable-id',
      }),
    ).resolves.toEqual({ ok: true, sendId: 'send-1' });

    expect(
      emailService.sendMemberRechargeVerificationEmail,
    ).toHaveBeenCalledWith({
      to: 'member@example.com',
      code: '100000',
      expiresInMin: 10,
      locale: 'en',
      userStableId: 'member-stable-id',
    });
  });

  it('preserves provider failure details for the Identity caller', async () => {
    const emailService = { sendMemberRechargeVerificationEmail: jest.fn() };
    emailService.sendMemberRechargeVerificationEmail.mockResolvedValue({
      ok: false,
      error: 'suppressed',
      sendId: 'send-failed',
    });
    const service = new MemberRechargeEmailDeliveryService(
      emailService as never,
    );

    await expect(
      service.sendRechargeVerificationEmail({
        to: 'member@example.com',
        code: '123456',
        expiresInMin: 10,
        locale: 'zh-CN',
        userStableId: 'member-stable-id',
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'suppressed',
      sendId: 'send-failed',
    });
  });
});
