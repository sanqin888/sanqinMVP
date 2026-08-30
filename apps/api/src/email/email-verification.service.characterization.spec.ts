import { createHash, createHmac } from 'crypto';
import {
  AuthChallengeStatus,
  AuthChallengeType,
  MessagingChannel,
} from '@prisma/client';
import { EmailVerificationService } from './email-verification.service';

type EmailVerificationInternals = {
  generateVerificationCode(): string;
  hashCode(code: string): string;
};

describe('EmailVerificationService OTP characterization', () => {
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
    const emailService = {
      sendVerificationEmail: jest.fn(),
    };
    const service = new EmailVerificationService(
      prisma as never,
      emailService as never,
    );

    return { service, prisma, emailService };
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

  it('uses OTP_SECRET and retains the non-production dev-secret fallback', () => {
    const { service } = createService();
    const internals = service as unknown as EmailVerificationInternals;

    process.env.OTP_SECRET = 'email-secret';
    expect(internals.hashCode('000042')).toBe(
      createHmac('sha256', 'email-secret').update('000042').digest('hex'),
    );

    delete process.env.OTP_SECRET;
    expect(internals.hashCode('000042')).toBe(
      createHmac('sha256', 'dev-secret').update('000042').digest('hex'),
    );
  });

  it('generates a zero-padded six-digit code and permits leading zeroes', () => {
    const crypto = jest.requireActual<typeof import('crypto')>('crypto');
    jest.spyOn(crypto, 'randomInt').mockReturnValue(42);
    const { service } = createService();
    const internals = service as unknown as EmailVerificationInternals;

    expect(internals.generateVerificationCode()).toBe('000042');
  });

  it('limits checkout requests to five per email and purpose in 24 hours', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma, emailService } = createService();
    prisma.authChallenge.count.mockResolvedValue(5);

    await expect(
      service.requestCheckoutVerification({
        email: ' Customer@Example.com ',
        purpose: 'checkout',
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'too many requests in a day',
    });

    expect(prisma.authChallenge.count).toHaveBeenCalledWith({
      where: {
        type: AuthChallengeType.EMAIL_VERIFY,
        channel: MessagingChannel.EMAIL,
        addressNorm: 'customer@example.com',
        purpose: 'checkout',
        createdAt: { gt: new Date('2026-08-29T12:00:00.000Z') },
      },
    });
    expect(prisma.authChallenge.create).not.toHaveBeenCalled();
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('looks up checkout codes by exact hash without incrementing failed attempts', async () => {
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
        codeHash: createHmac('sha256', 'checkout-secret')
          .update('123456')
          .digest('hex'),
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
    const { service, prisma } = createService();
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
    const verificationToken =
      'verificationToken' in result ? result.verificationToken : '';

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
