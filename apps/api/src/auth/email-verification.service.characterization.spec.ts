import { createHash } from 'crypto';
import {
  AuthChallengeStatus,
  AuthChallengeType,
  MessagingChannel,
} from '@prisma/client';

import { ChallengeEngine } from './challenge-engine.service';
import { EmailVerificationService } from './email-verification.service';

describe('EmailVerificationService ownership characterization', () => {
  const originalOtpSecret = process.env.OTP_SECRET;

  const createService = () => {
    const prisma = {
      authChallenge: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const delivery = {
      sendVerificationEmail: jest.fn(),
    };
    const challengeEngine = new ChallengeEngine();
    const otpPolicy = {
      checkSend: jest.fn().mockResolvedValue({ ok: true }),
      revokeSupersededCodes: jest.fn().mockResolvedValue(undefined),
    };
    const service = new EmailVerificationService(
      prisma as never,
      delivery as never,
      challengeEngine,
      otpPolicy as never,
    );

    return { service, prisma, delivery, challengeEngine, otpPolicy };
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

  it('owns member email verification from stable identity through challenge delivery', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T18:30:00.000Z'));
    const { service, prisma, delivery, challengeEngine } = createService();
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-db-id',
        email: 'old@example.com',
        emailVerifiedAt: null,
        firstName: 'San',
        lastName: 'Qin',
        language: 'ZH',
      })
      .mockResolvedValueOnce(null);
    prisma.authChallenge.create.mockResolvedValue({ id: 'challenge-1' });
    prisma.authChallenge.update.mockResolvedValue({ id: 'challenge-1' });
    jest.spyOn(challengeEngine, 'generateCode').mockReturnValue('000042');
    jest.spyOn(challengeEngine, 'hashCode').mockReturnValue('code-hash');
    delivery.sendVerificationEmail.mockResolvedValue({
      ok: true,
      sendId: 'send-1',
    });

    await expect(
      service.requestUserVerification({
        userStableId: 'c1234567890abcdefghijklmn',
        email: 'New@Example.com',
      }),
    ).resolves.toEqual({ ok: true });

    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(1, {
      where: { userStableId: 'c1234567890abcdefghijklmn' },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        firstName: true,
        lastName: true,
        language: true,
      },
    });
    expect(prisma.authChallenge.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-db-id',
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        addressNorm: 'new@example.com',
        addressRaw: 'new@example.com',
        codeHash: 'code-hash',
        purpose: 'email_verify',
        expiresAt: new Date('2026-09-04T18:40:00.000Z'),
      },
    });
    expect(delivery.sendVerificationEmail).toHaveBeenCalledWith({
      to: 'new@example.com',
      token: '000042',
      name: 'San Qin',
      locale: 'zh',
    });
    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: { messagingSendId: 'send-1' },
    });
  });

  it('mutates the verified user through stable identity while keeping DB identity internal', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T18:30:00.000Z'));
    const { service, prisma, challengeEngine } = createService();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-db-id' });
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1',
      codeHash: 'code-hash',
      attempts: 0,
      maxAttempts: 5,
      addressNorm: 'verified@example.com',
      expiresAt: new Date('2026-09-04T18:40:00.000Z'),
    });
    prisma.authChallenge.update.mockReturnValue({ operation: 'consume-code' });
    prisma.user.update.mockReturnValue({ operation: 'verify-user' });
    jest.spyOn(challengeEngine, 'verifyCodeHash').mockReturnValue(true);

    await expect(
      service.verifyUserEmailCode({
        userStableId: 'c1234567890abcdefghijklmn',
        code: '123456',
      }),
    ).resolves.toEqual({ ok: true, email: 'verified@example.com' });

    expect(prisma.authChallenge.findFirst).toHaveBeenCalledWith({
      where: {
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        status: AuthChallengeStatus.PENDING,
        userId: 'user-db-id',
        purpose: 'email_verify',
        codeHash: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      { operation: 'consume-code' },
      { operation: 'verify-user' },
    ]);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-db-id' },
      data: {
        emailVerifiedAt: new Date('2026-09-04T18:30:00.000Z'),
        email: 'verified@example.com',
      },
    });
  });

  it('selects the zero-padded OTP profile for checkout email challenges', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma, delivery, challengeEngine } = createService();
    prisma.authChallenge.count.mockResolvedValue(0);
    prisma.authChallenge.create.mockResolvedValue({ id: 'challenge-1' });
    prisma.authChallenge.update.mockResolvedValue({ id: 'challenge-1' });
    const generateCodeSpy = jest
      .spyOn(challengeEngine, 'generateCode')
      .mockReturnValue('000042');
    const hashCodeSpy = jest
      .spyOn(challengeEngine, 'hashCode')
      .mockReturnValue('code-hash');
    delivery.sendVerificationEmail.mockResolvedValue({
      ok: true,
      sendId: 'send-1',
    });

    await expect(
      service.requestCheckoutVerification({
        email: 'Customer@Example.com',
        purpose: 'checkout',
      }),
    ).resolves.toEqual({ ok: true });

    expect(generateCodeSpy).toHaveBeenCalledWith('ZERO_PADDED');
    expect(hashCodeSpy).toHaveBeenCalledWith('000042', 'OTP');
    expect(prisma.authChallenge.create).toHaveBeenCalledWith({
      data: {
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        addressNorm: 'customer@example.com',
        addressRaw: 'Customer@Example.com',
        codeHash: 'code-hash',
        purpose: 'checkout',
        expiresAt: new Date('2026-08-30T12:10:00.000Z'),
        ip: undefined,
      },
    });
  });

  it('limits checkout requests to five per email and purpose in 24 hours', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma, delivery, otpPolicy } = createService();
    otpPolicy.checkSend.mockResolvedValue({
      ok: false,
      violation: 'DAILY_LIMIT',
    });

    await expect(
      service.requestCheckoutVerification({
        email: ' Customer@Example.com ',
        purpose: 'checkout',
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'too many requests in a day',
    });

    expect(otpPolicy.checkSend).toHaveBeenCalledWith({
      profile: 'CHECKOUT',
      purpose: 'checkout',
      now: new Date('2026-08-30T12:00:00.000Z'),
      addressNorm: 'customer@example.com',
      ip: undefined,
    });
    expect(prisma.authChallenge.create).not.toHaveBeenCalled();
    expect(delivery.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('looks up only the latest active checkout code', async () => {
    const { service, prisma } = createService();
    process.env.OTP_SECRET = 'checkout-secret';
    prisma.authChallenge.findFirst.mockResolvedValue(null);

    await expect(
      service.verifyCheckoutToken({
        email: 'Customer@Example.com',
        token: '123456',
      }),
    ).resolves.toEqual({ ok: false, error: 'token_not_found' });

    expect(prisma.authChallenge.findFirst).toHaveBeenCalledWith({
      where: {
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        status: AuthChallengeStatus.PENDING,
        addressNorm: 'customer@example.com',
        purpose: 'checkout',
        codeHash: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.authChallenge.update).not.toHaveBeenCalled();
  });

  it('marks an expired checkout code as expired and consumed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1',
      expiresAt: new Date('2026-08-30T11:59:59.000Z'),
    });

    await expect(
      service.verifyCheckoutToken({
        email: 'customer@example.com',
        token: '123456',
      }),
    ).resolves.toEqual({ ok: false, error: 'token_expired' });

    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: {
        status: AuthChallengeStatus.EXPIRED,
        consumedAt: new Date('2026-08-30T12:00:00.000Z'),
      },
    });
  });

  it('consumes a valid code and creates a pending token with the original expiry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma, challengeEngine } = createService();
    jest.spyOn(challengeEngine, 'verifyCodeHash').mockReturnValue(true);
    const expiresAt = new Date('2026-08-30T12:10:00.000Z');
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1',
      addressNorm: 'customer@example.com',
      addressRaw: 'Customer@Example.com',
      expiresAt,
    });
    prisma.authChallenge.update.mockReturnValue({ operation: 'consume-code' });
    prisma.authChallenge.create.mockReturnValue({ operation: 'create-token' });

    const result = await service.verifyCheckoutToken({
      email: 'customer@example.com',
      token: '123456',
    });
    const verificationToken = result.verificationToken ?? '';

    expect(result.ok).toBe(true);
    expect(verificationToken).toMatch(/^[0-9a-f]{64}$/);
    expect(prisma.authChallenge.create).toHaveBeenCalledWith({
      data: {
        type: AuthChallengeType.EMAIL_VERIFY,
        status: AuthChallengeStatus.PENDING,
        channel: MessagingChannel.EMAIL,
        addressNorm: 'customer@example.com',
        addressRaw: 'Customer@Example.com',
        purpose: 'checkout',
        expiresAt,
        tokenHash: createHash('sha256').update(verificationToken).digest('hex'),
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      { operation: 'consume-code' },
      { operation: 'create-token' },
    ]);
  });
});
