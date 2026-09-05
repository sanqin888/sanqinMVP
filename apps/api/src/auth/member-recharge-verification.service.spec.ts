import { createHash, createHmac } from 'crypto';
import {
  AuthChallengeStatus,
  AuthChallengeType,
  MessagingChannel,
} from '@prisma/client';

import { ChallengeEngine } from './challenge-engine.service';
import { MemberRechargeVerificationService } from './member-recharge-verification.service';

describe('MemberRechargeVerificationService', () => {
  const originalRechargeSecret = process.env.MEMBER_RECHARGE_OTP_SECRET;

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
    const phoneVerificationDelivery = {
      sendVerificationSms: jest.fn(),
    };
    const memberRechargeEmailDelivery = {
      sendRechargeVerificationEmail: jest.fn(),
    };
    const challengeEngine = new ChallengeEngine();
    const service = new MemberRechargeVerificationService(
      prisma as never,
      phoneVerificationDelivery as never,
      memberRechargeEmailDelivery as never,
      challengeEngine,
    );

    return {
      service,
      prisma,
      phoneVerificationDelivery,
      memberRechargeEmailDelivery,
      challengeEngine,
    };
  };

  const allowSend = (prisma: ReturnType<typeof createService>['prisma']) => {
    prisma.authChallenge.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    if (originalRechargeSecret === undefined) {
      delete process.env.MEMBER_RECHARGE_OTP_SECRET;
    } else {
      process.env.MEMBER_RECHARGE_OTP_SECRET = originalRechargeSecret;
    }
  });

  it('creates email recharge codes with the recharge secret and audit linkage', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma, memberRechargeEmailDelivery, challengeEngine } =
      createService();
    prisma.user.findUnique.mockResolvedValue(emailMember);
    allowSend(prisma);
    const generateCodeSpy = jest
      .spyOn(challengeEngine, 'generateCode')
      .mockReturnValue('100000');
    const hashCodeSpy = jest
      .spyOn(challengeEngine, 'hashCode')
      .mockReturnValue('code-hash');
    prisma.authChallenge.create.mockResolvedValue({ id: 'challenge-1' });
    memberRechargeEmailDelivery.sendRechargeVerificationEmail.mockResolvedValue(
      {
        ok: true,
        sendId: 'send-1',
      },
    );

    await expect(
      service.sendCode({
        userStableId: 'member-stable-id',
        email: 'member@example.com',
        locale: 'en',
      }),
    ).resolves.toEqual({ ok: true });

    expect(generateCodeSpy).toHaveBeenCalledWith('NON_ZERO_SIX_DIGIT');
    expect(hashCodeSpy).toHaveBeenCalledWith('100000', 'MEMBER_RECHARGE');
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
    const { service, prisma, memberRechargeEmailDelivery } = createService();
    prisma.user.findUnique.mockResolvedValue(emailMember);
    allowSend(prisma);
    prisma.authChallenge.create.mockResolvedValue({ id: 'email-failed' });
    memberRechargeEmailDelivery.sendRechargeVerificationEmail.mockResolvedValue(
      {
        ok: false,
        sendId: 'send-failed',
      },
    );

    await expect(
      service.sendCode({ userStableId: 'member-stable-id' }),
    ).resolves.toEqual({ ok: false, error: 'email_send_failed' });
    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'email-failed' },
      data: { messagingSendId: 'send-failed' },
    });
  });

  it('creates SMS recharge challenges inside the recharge owner', async () => {
    const { service, prisma, phoneVerificationDelivery, challengeEngine } =
      createService();
    prisma.user.findUnique.mockResolvedValue(phoneMember);
    allowSend(prisma);
    jest.spyOn(challengeEngine, 'generateCode').mockReturnValue('234567');
    const hashCodeSpy = jest
      .spyOn(challengeEngine, 'hashCode')
      .mockReturnValue('sms-code-hash');
    prisma.authChallenge.create.mockResolvedValue({ id: 'sms-challenge' });
    phoneVerificationDelivery.sendVerificationSms.mockResolvedValue({
      ok: true,
      sendId: 'sms-send',
    });

    await expect(
      service.sendCode({
        userStableId: 'member-stable-id',
        phone: '+1 416 555 0100',
        locale: 'en',
      }),
    ).resolves.toEqual({ ok: true });

    expect(hashCodeSpy).toHaveBeenCalledWith('234567', 'MEMBER_RECHARGE');
    expect(prisma.authChallenge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-db-id',
        type: AuthChallengeType.PHONE_VERIFY,
        status: AuthChallengeStatus.PENDING,
        channel: MessagingChannel.SMS,
        addressNorm: '+14165550100',
        purpose: 'pos-recharge',
        codeHash: 'sms-code-hash',
      }),
    });
    expect(phoneVerificationDelivery.sendVerificationSms).toHaveBeenCalledWith({
      phone: '+1 416 555 0100',
      code: '234567',
      expiresInMin: 10,
      locale: 'en',
      purpose: 'pos-recharge',
    });
    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'sms-challenge' },
      data: { messagingSendId: 'sms-send' },
    });
  });

  it('uses one DB-backed 60-second cooldown across recharge channels', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma, memberRechargeEmailDelivery } = createService();
    prisma.user.findUnique.mockResolvedValue(emailMember);
    prisma.authChallenge.count.mockResolvedValueOnce(1);

    await expect(
      service.sendCode({ userStableId: 'member-stable-id' }),
    ).resolves.toEqual({
      ok: false,
      error: 'too many requests, please try later',
    });

    expect(prisma.authChallenge.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-db-id',
        purpose: 'pos-recharge',
        codeHash: { not: null },
        createdAt: { gt: new Date('2026-08-30T11:59:00.000Z') },
      },
    });
    expect(prisma.authChallenge.create).not.toHaveBeenCalled();
    expect(
      memberRechargeEmailDelivery.sendRechargeVerificationEmail,
    ).not.toHaveBeenCalled();
  });

  it('enforces one five-send daily recharge budget per member', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma, phoneVerificationDelivery } = createService();
    prisma.user.findUnique.mockResolvedValue(phoneMember);
    prisma.authChallenge.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(5);

    await expect(
      service.sendCode({ userStableId: 'member-stable-id' }),
    ).resolves.toEqual({
      ok: false,
      error: 'too many requests in a day',
    });

    expect(prisma.authChallenge.count).toHaveBeenNthCalledWith(2, {
      where: {
        userId: 'user-db-id',
        purpose: 'pos-recharge',
        codeHash: { not: null },
        createdAt: { gt: new Date('2026-08-29T12:00:00.000Z') },
      },
    });
    expect(prisma.authChallenge.create).not.toHaveBeenCalled();
    expect(phoneVerificationDelivery.sendVerificationSms).not.toHaveBeenCalled();
  });

  it('links provider failures without reporting a successful send', async () => {
    const { service, prisma, phoneVerificationDelivery } = createService();
    prisma.user.findUnique.mockResolvedValue(phoneMember);
    allowSend(prisma);
    prisma.authChallenge.create.mockResolvedValue({ id: 'sms-failed' });
    phoneVerificationDelivery.sendVerificationSms.mockResolvedValue({
      ok: false,
      sendId: 'send-failed',
      error: 'suppressed',
    });

    await expect(
      service.sendCode({ userStableId: 'member-stable-id' }),
    ).resolves.toEqual({ ok: false, error: 'sms_send_failed' });
    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'sms-failed' },
      data: { messagingSendId: 'send-failed' },
    });
  });

  it('keeps profile email preferred when a phone is supplied', async () => {
    const {
      service,
      prisma,
      phoneVerificationDelivery,
      memberRechargeEmailDelivery,
    } = createService();
    prisma.user.findUnique.mockResolvedValue(emailMember);
    allowSend(prisma);
    prisma.authChallenge.create.mockResolvedValue({ id: 'challenge-email' });
    memberRechargeEmailDelivery.sendRechargeVerificationEmail.mockResolvedValue(
      {
        ok: true,
        sendId: 'send-email',
      },
    );

    await service.sendCode({
      userStableId: 'member-stable-id',
      phone: '+1 416 555 0100',
    });

    expect(
      memberRechargeEmailDelivery.sendRechargeVerificationEmail,
    ).toHaveBeenCalledTimes(1);
    expect(phoneVerificationDelivery.sendVerificationSms).not.toHaveBeenCalled();
  });

  it('revokes a recharge code on the final mismatch with the recharge secret', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma } = createService();
    process.env.MEMBER_RECHARGE_OTP_SECRET = 'recharge-secret';
    prisma.user.findUnique.mockResolvedValue(emailMember);
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1',
      codeHash: createHmac('sha256', 'recharge-secret')
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

    expect(prisma.authChallenge.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'user-db-id',
        purpose: 'pos-recharge',
        codeHash: { not: null },
      }),
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: {
        attempts: 5,
        status: AuthChallengeStatus.REVOKED,
        consumedAt: new Date('2026-08-30T12:00:00.000Z'),
      },
    });
  });

  it('consumes an SMS code and creates a member-bound token with the same expiry', async () => {
    const { service, prisma } = createService();
    process.env.MEMBER_RECHARGE_OTP_SECRET = 'recharge-secret';
    prisma.user.findUnique.mockResolvedValue(phoneMember);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1',
      codeHash: createHmac('sha256', 'recharge-secret')
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
      code: '123456',
    });
    const verificationToken = result.verificationToken ?? '';

    expect(result.ok).toBe(true);
    expect(verificationToken).toMatch(/^[0-9a-f]{64}$/);
    expect(prisma.authChallenge.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-db-id',
        type: AuthChallengeType.PHONE_VERIFY,
        status: AuthChallengeStatus.PENDING,
        channel: MessagingChannel.SMS,
        addressNorm: '+14165550100',
        addressRaw: '+14165550100',
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

  it('atomically claims a recharge token by member and stable contact', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue(emailMember);
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'token-challenge-1',
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
        userId: 'user-db-id',
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
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(emailMember);

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
