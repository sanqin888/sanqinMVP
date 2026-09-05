import { createHash, createHmac } from 'crypto';
import {
  AuthChallengeStatus,
  AuthChallengeType,
  MessagingChannel,
} from '@prisma/client';

import { ChallengeEngine } from './challenge-engine.service';
import { MemberRechargeVerificationService } from './member-recharge-verification.service';

describe('MemberRechargeVerificationService', () => {
  const originalOtpSecret = process.env.OTP_SECRET;

  const emailMember = {
    id: 'user-db-id',
    userStableId: 'member-stable-id',
    email: 'Member@Example.com',
    phone: '+14165550100',
  };

  const phoneMember = {
    ...emailMember,
    email: null,
  };

  const createService = () => {
    const prisma = {
      user: {
        findUnique: jest.fn(),
      },
      authChallenge: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const phoneVerification = {
      sendCode: jest.fn(),
      verifyCode: jest.fn(),
    };
    const memberRechargeEmailDelivery = {
      sendRechargeVerificationEmail: jest.fn(),
    };
    const challengeEngine = new ChallengeEngine();
    const service = new MemberRechargeVerificationService(
      prisma as never,
      phoneVerification as never,
      memberRechargeEmailDelivery as never,
      challengeEngine,
    );

    return {
      service,
      prisma,
      phoneVerification,
      memberRechargeEmailDelivery,
      challengeEngine,
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    if (originalOtpSecret === undefined) {
      delete process.env.OTP_SECRET;
    } else {
      process.env.OTP_SECRET = originalOtpSecret;
    }
  });

  it('preserves email recharge code creation, delivery audit linkage, and no owner-side daily limit', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma, memberRechargeEmailDelivery, challengeEngine } =
      createService();
    prisma.user.findUnique.mockResolvedValue(emailMember);
    const generateCodeSpy = jest
      .spyOn(challengeEngine, 'generateCode')
      .mockReturnValue('100000');
    const hashCodeSpy = jest
      .spyOn(challengeEngine, 'hashCode')
      .mockReturnValue('code-hash');
    prisma.authChallenge.create.mockResolvedValue({ id: 'challenge-1' });
    memberRechargeEmailDelivery.sendRechargeVerificationEmail.mockResolvedValue({
      ok: true,
      sendId: 'send-1',
    });

    await expect(
      service.sendCode({
        userStableId: 'member-stable-id',
        email: 'member@example.com',
        locale: 'en',
      }),
    ).resolves.toEqual({ ok: true });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { userStableId: 'member-stable-id' },
      select: {
        id: true,
        userStableId: true,
        email: true,
        phone: true,
      },
    });
    expect(generateCodeSpy).toHaveBeenCalledWith('NON_ZERO_SIX_DIGIT');
    expect(hashCodeSpy).toHaveBeenCalledWith('100000', 'OTP');
    expect(prisma.authChallenge.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-db-id',
        type: AuthChallengeType.EMAIL_VERIFY,
        status: AuthChallengeStatus.PENDING,
        channel: MessagingChannel.EMAIL,
        addressNorm: 'member@example.com',
        addressRaw: 'Member@Example.com',
        codeHash: 'code-hash',
        purpose: 'pos-recharge',
        expiresAt: new Date('2026-08-30T12:10:00.000Z'),
      },
    });
    expect(prisma.authChallenge.count).not.toHaveBeenCalled();
    expect(
      memberRechargeEmailDelivery.sendRechargeVerificationEmail,
    ).toHaveBeenCalledWith({
      to: 'member@example.com',
      code: '100000',
      expiresInMin: 10,
      locale: 'en',
      userStableId: 'member-stable-id',
    });
    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: { messagingSendId: 'send-1' },
    });
  });

  it('preserves email_send_failed after linking the provider send id', async () => {
    const { service, prisma, memberRechargeEmailDelivery, challengeEngine } =
      createService();
    prisma.user.findUnique.mockResolvedValue(emailMember);
    jest.spyOn(challengeEngine, 'generateCode').mockReturnValue('123456');
    prisma.authChallenge.create.mockResolvedValue({ id: 'challenge-failed' });
    memberRechargeEmailDelivery.sendRechargeVerificationEmail.mockResolvedValue({
      ok: false,
      sendId: 'send-failed',
    });

    await expect(
      service.sendCode({
        userStableId: 'member-stable-id',
        email: 'member@example.com',
        locale: 'zh-CN',
      }),
    ).resolves.toEqual({ ok: false, error: 'email_send_failed' });

    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-failed' },
      data: { messagingSendId: 'send-failed' },
    });
  });

  it('keeps profile email as the preferred recharge channel even when a phone is supplied', async () => {
    const { service, prisma, phoneVerification, memberRechargeEmailDelivery } =
      createService();
    prisma.user.findUnique.mockResolvedValue(emailMember);
    prisma.authChallenge.create.mockResolvedValue({ id: 'challenge-email' });
    memberRechargeEmailDelivery.sendRechargeVerificationEmail.mockResolvedValue({
      ok: true,
      sendId: 'send-email',
    });

    await service.sendCode({
      userStableId: 'member-stable-id',
      phone: '+1 416 555 0100',
    });

    expect(
      memberRechargeEmailDelivery.sendRechargeVerificationEmail,
    ).toHaveBeenCalledTimes(1);
    expect(phoneVerification.sendCode).not.toHaveBeenCalled();
  });

  it('increments attempts and revokes an email recharge code on the final mismatch', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma } = createService();
    process.env.OTP_SECRET = 'admin-secret';
    prisma.user.findUnique.mockResolvedValue(emailMember);
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1',
      codeHash: createHmac('sha256', 'admin-secret')
        .update('654321')
        .digest('hex'),
      attempts: 4,
      maxAttempts: 5,
      expiresAt: new Date('2026-08-30T12:10:00.000Z'),
    });

    await expect(
      service.verifyCode({
        userStableId: 'member-stable-id',
        email: 'member@example.com',
        code: '123456',
      }),
    ).resolves.toEqual({ ok: false, error: 'code_invalid' });

    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: {
        attempts: 5,
        status: AuthChallengeStatus.REVOKED,
        consumedAt: new Date('2026-08-30T12:00:00.000Z'),
      },
    });
  });

  it('consumes an email code and creates a pending recharge token with the same expiry', async () => {
    const { service, prisma } = createService();
    process.env.OTP_SECRET = 'admin-secret';
    prisma.user.findUnique.mockResolvedValue(emailMember);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1',
      codeHash: createHmac('sha256', 'admin-secret')
        .update('123456')
        .digest('hex'),
      attempts: 0,
      maxAttempts: 5,
      expiresAt,
    });
    prisma.authChallenge.update.mockReturnValue({ operation: 'consume-code' });
    prisma.authChallenge.create.mockReturnValue({ operation: 'create-token' });

    const result = await service.verifyCode({
      userStableId: 'member-stable-id',
      email: 'member@example.com',
      code: '123456',
    });
    const verificationToken = result.verificationToken ?? '';

    expect(result.ok).toBe(true);
    expect(verificationToken).toMatch(/^[0-9a-f]{64}$/);
    expect(prisma.authChallenge.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-db-id',
        type: AuthChallengeType.EMAIL_VERIFY,
        status: AuthChallengeStatus.PENDING,
        channel: MessagingChannel.EMAIL,
        addressNorm: 'member@example.com',
        addressRaw: 'Member@Example.com',
        purpose: 'pos-recharge',
        expiresAt,
        tokenHash: createHash('sha256').update(verificationToken).digest('hex'),
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      { operation: 'consume-code' },
      { operation: 'create-token' },
    ]);
  });

  it('delegates phone recharge send and verification with the unchanged purpose', async () => {
    const { service, prisma, phoneVerification } = createService();
    prisma.user.findUnique.mockResolvedValue(phoneMember);
    phoneVerification.sendCode.mockResolvedValue({ ok: true });
    phoneVerification.verifyCode.mockResolvedValue({
      ok: true,
      verificationToken: 'phone-token',
    });

    await expect(
      service.sendCode({
        userStableId: 'member-stable-id',
        phone: '+1 416 555 0100',
        locale: 'en',
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      service.verifyCode({
        userStableId: 'member-stable-id',
        phone: '+1 416 555 0100',
        code: '123456',
      }),
    ).resolves.toEqual({ ok: true, verificationToken: 'phone-token' });

    expect(phoneVerification.sendCode).toHaveBeenCalledWith({
      phone: '+1 416 555 0100',
      locale: 'en',
      purpose: 'pos-recharge',
    });
    expect(phoneVerification.verifyCode).toHaveBeenCalledWith({
      phone: '+1 416 555 0100',
      code: '123456',
      purpose: 'pos-recharge',
    });
  });

  it('atomically claims a recharge verification token by stable member contact', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue(emailMember);
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'token-challenge-1',
      purpose: 'pos-recharge',
      addressNorm: 'member@example.com',
      expiresAt: new Date('2026-08-30T12:10:00.000Z'),
    });
    prisma.authChallenge.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.consumeVerificationToken({
        userStableId: 'member-stable-id',
        verificationToken: 'single-use-token',
      }),
    ).resolves.toBeUndefined();

    expect(prisma.authChallenge.findFirst).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256')
          .update('single-use-token')
          .digest('hex'),
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        purpose: 'pos-recharge',
        status: AuthChallengeStatus.PENDING,
        addressNorm: 'member@example.com',
      },
    });
    expect(prisma.authChallenge.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'token-challenge-1',
        status: AuthChallengeStatus.PENDING,
        purpose: 'pos-recharge',
      },
      data: {
        status: AuthChallengeStatus.CONSUMED,
        consumedAt: new Date('2026-08-30T12:00:00.000Z'),
      },
    });
  });

  it('rejects a recharge token that another request already consumed', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue(emailMember);
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'token-challenge-1',
      purpose: 'pos-recharge',
      addressNorm: 'member@example.com',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    prisma.authChallenge.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.consumeVerificationToken({
        userStableId: 'member-stable-id',
        verificationToken: 'already-used-token',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'VERIFICATION_TOKEN_ALREADY_USED',
        message: 'verificationToken already used',
      }),
    );
  });

  it('preserves member/contact validation errors behind the owner boundary', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(emailMember);

    await expect(
      service.sendCode({ userStableId: 'missing-member' }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'USER_NOT_FOUND',
        message: 'member not found',
      }),
    );

    await expect(
      service.sendCode({
        userStableId: 'member-stable-id',
        email: 'other@example.com',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'EMAIL_MISMATCH',
        message: 'email does not match member profile',
      }),
    );
  });
});
