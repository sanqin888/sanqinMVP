import { BadRequestException, NotFoundException } from '@nestjs/common';

import { MemberRechargeVerificationError } from '../../auth/public-api';
import { AdminMembersService } from './admin-members.service';

describe('AdminMembersService recharge verification adapter', () => {
  const createService = () => {
    const prisma = {};
    const loyalty = {
      applyTopup: jest.fn(),
    };
    const loyaltyPolicyReader = {
      getLoyaltyPolicySnapshot: jest.fn(),
    };
    const customerAdministration = {};
    const accountSecurityAdministration = {};
    const memberRechargeVerification = {
      sendCode: jest.fn(),
      verifyCode: jest.fn(),
      consumeVerificationToken: jest.fn(),
    };
    const service = new AdminMembersService(
      prisma as never,
      loyalty as never,
      {} as never,
      loyaltyPolicyReader as never,
      customerAdministration as never,
      accountSecurityAdministration as never,
      memberRechargeVerification as never,
    );

    return {
      service,
      loyalty,
      memberRechargeVerification,
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('delegates recharge code send and verify to the Identity owner', async () => {
    const { service, memberRechargeVerification } = createService();
    memberRechargeVerification.sendCode.mockResolvedValue({ ok: true });
    memberRechargeVerification.verifyCode.mockResolvedValue({
      ok: true,
      verificationToken: 'verification-token',
    });

    await expect(
      service.sendRechargeCode('member-stable-id', {
        email: 'member@example.com',
        phone: '+14165550100',
        locale: 'en',
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      service.verifyRechargeCode('member-stable-id', {
        email: 'member@example.com',
        phone: '+14165550100',
        code: '123456',
      }),
    ).resolves.toEqual({
      ok: true,
      verificationToken: 'verification-token',
    });

    expect(memberRechargeVerification.sendCode).toHaveBeenCalledWith({
      userStableId: 'member-stable-id',
      email: 'member@example.com',
      phone: '+14165550100',
      locale: 'en',
    });
    expect(memberRechargeVerification.verifyCode).toHaveBeenCalledWith({
      userStableId: 'member-stable-id',
      email: 'member@example.com',
      phone: '+14165550100',
      code: '123456',
    });
  });

  it('preserves owner result errors without turning them into transport exceptions', async () => {
    const { service, memberRechargeVerification } = createService();
    memberRechargeVerification.sendCode.mockResolvedValue({
      ok: false,
      error: 'email_send_failed',
    });

    await expect(
      service.sendRechargeCode('member-stable-id', {}),
    ).resolves.toEqual({ ok: false, error: 'email_send_failed' });
  });

  it('maps owner member-not-found and validation errors to the historical HTTP exceptions', async () => {
    const { service, memberRechargeVerification } = createService();
    memberRechargeVerification.sendCode.mockRejectedValueOnce(
      new MemberRechargeVerificationError('USER_NOT_FOUND', 'member not found'),
    );
    memberRechargeVerification.verifyCode.mockRejectedValueOnce(
      new MemberRechargeVerificationError('CODE_REQUIRED', 'code is required'),
    );

    await expect(
      service.sendRechargeCode('missing-member', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.verifyRechargeCode('member-stable-id', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('claims the verification token before applying the Loyalty top-up', async () => {
    const { service, loyalty, memberRechargeVerification } = createService();
    memberRechargeVerification.consumeVerificationToken.mockResolvedValue(
      undefined,
    );
    loyalty.applyTopup.mockResolvedValue({ balanceCents: 5000 });

    await expect(
      service.rechargeWithVerification('member-stable-id', {
        amountCents: 5000,
        bonusPoints: 20,
        verificationToken: 'single-use-token',
        idempotencyKey: 'topup-1',
      }),
    ).resolves.toEqual({
      userStableId: 'member-stable-id',
      balanceCents: 5000,
    });

    expect(
      memberRechargeVerification.consumeVerificationToken,
    ).toHaveBeenCalledWith({
      userStableId: 'member-stable-id',
      verificationToken: 'single-use-token',
    });
    expect(loyalty.applyTopup).toHaveBeenCalledWith({
      userStableId: 'member-stable-id',
      amountCents: 5000,
      bonusPoints: 20,
      idempotencyKey: 'topup-1',
    });
    expect(
      memberRechargeVerification.consumeVerificationToken.mock
        .invocationCallOrder[0],
    ).toBeLessThan(loyalty.applyTopup.mock.invocationCallOrder[0]);
  });

  it('does not top up when the owner reports an already-consumed token', async () => {
    const { service, loyalty, memberRechargeVerification } = createService();
    memberRechargeVerification.consumeVerificationToken.mockRejectedValue(
      new MemberRechargeVerificationError(
        'VERIFICATION_TOKEN_ALREADY_USED',
        'verificationToken already used',
      ),
    );

    await expect(
      service.rechargeWithVerification('member-stable-id', {
        amountCents: 5000,
        verificationToken: 'already-used-token',
      }),
    ).rejects.toThrow('verificationToken already used');
    expect(loyalty.applyTopup).not.toHaveBeenCalled();
  });
});
