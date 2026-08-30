import { createHmac } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import {
  AuthChallengeStatus,
  AuthChallengeType,
  MessagingChannel,
} from '@prisma/client';
import { AuthService } from './auth.service';

type AuthOtpInternals = {
  generateCode(): string;
  hashOtp(code: string): string;
};

describe('AuthService OTP characterization', () => {
  const originalOtpSecret = process.env.OTP_SECRET;

  const createService = () => {
    const prisma = {
      authChallenge: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      userSession: {
        update: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const service = new AuthService(
      prisma as never,
      { sendEmail: jest.fn() } as never,
      { sendSms: jest.fn() } as never,
      { renderEmail: jest.fn(), renderSms: jest.fn() } as never,
      { getMessagingSnapshot: jest.fn() } as never,
      {} as never,
      {} as never,
    );

    return { service, prisma };
  };

  const session = {
    id: 'session-db-id',
    sessionId: 'session-id',
    mfaVerifiedAt: null,
    user: {
      id: 'user-db-id',
      role: 'ADMIN',
      phone: '+14165550100',
      phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
      email: 'admin@example.com',
      emailVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
      twoFactorEnabledAt: null,
      twoFactorMethod: 'NONE',
      language: 'EN',
    },
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
    const internals = service as unknown as AuthOtpInternals;

    process.env.OTP_SECRET = 'auth-secret';
    expect(internals.hashOtp('000042')).toBe(
      createHmac('sha256', 'auth-secret').update('000042').digest('hex'),
    );

    delete process.env.OTP_SECRET;
    expect(internals.hashOtp('000042')).toBe(
      createHmac('sha256', 'dev-secret').update('000042').digest('hex'),
    );
  });

  it('generates a zero-padded six-digit code and permits leading zeroes', () => {
    const crypto = jest.requireActual<typeof import('crypto')>('crypto');
    jest.spyOn(crypto, 'randomInt').mockReturnValue(42);
    const { service } = createService();

    expect((service as unknown as AuthOtpInternals).generateCode()).toBe(
      '000042',
    );
  });

  it('blocks an SMS request when either SMS or email has a recent pending challenge', async () => {
    const { service, prisma } = createService();
    jest.spyOn(service, 'getSession').mockResolvedValue(session as never);
    prisma.authChallenge.findFirst.mockResolvedValue({ id: 'recent-email' });

    await expect(
      service.requestTwoFactorSms({ sessionId: 'session-id' }),
    ).rejects.toThrow(
      new BadRequestException('too many requests, please try later'),
    );

    expect(prisma.authChallenge.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'user-db-id',
        type: AuthChallengeType.TWO_FACTOR,
        channel: {
          in: [MessagingChannel.SMS, MessagingChannel.EMAIL],
        },
        purpose: 'LOGIN_2FA',
        status: AuthChallengeStatus.PENDING,
      }),
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.authChallenge.count).not.toHaveBeenCalled();
  });

  it('uses an email-only recent-request check for email challenges', async () => {
    const { service, prisma } = createService();
    jest.spyOn(service, 'getSession').mockResolvedValue(session as never);
    prisma.authChallenge.findFirst.mockResolvedValue({ id: 'recent-email' });

    await expect(
      service.requestTwoFactorEmail({ sessionId: 'session-id' }),
    ).rejects.toThrow('too many requests, please try later');

    expect(prisma.authChallenge.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        channel: MessagingChannel.EMAIL,
        purpose: 'LOGIN_2FA',
        status: AuthChallengeStatus.PENDING,
      }),
      orderBy: { createdAt: 'desc' },
    });
  });

  it('increments attempts and revokes a 2FA challenge on the final mismatch', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma } = createService();
    process.env.OTP_SECRET = 'auth-secret';
    jest.spyOn(service, 'getSession').mockResolvedValue(session as never);
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1',
      codeHash: createHmac('sha256', 'auth-secret')
        .update('654321')
        .digest('hex'),
      attempts: 4,
      maxAttempts: 5,
    });

    await expect(
      service.verifyTwoFactorSms({
        sessionId: 'session-id',
        code: '123456',
      }),
    ).rejects.toThrow('verification code is invalid or expired');

    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: {
        attempts: 5,
        status: AuthChallengeStatus.REVOKED,
        consumedAt: new Date('2026-08-30T12:00:00.000Z'),
      },
    });
  });

  it('consumes a matching challenge and marks the session MFA-verified atomically', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma } = createService();
    process.env.OTP_SECRET = 'auth-secret';
    jest.spyOn(service, 'getSession').mockResolvedValue(session as never);
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1',
      codeHash: createHmac('sha256', 'auth-secret')
        .update('123456')
        .digest('hex'),
      attempts: 0,
      maxAttempts: 5,
    });
    prisma.authChallenge.update.mockReturnValue({ operation: 'consume-code' });
    prisma.userSession.update.mockReturnValue({ operation: 'verify-session' });

    await expect(
      service.verifyTwoFactorEmail({
        sessionId: 'session-id',
        code: ' 123456 ',
      }),
    ).resolves.toEqual({ success: true, trustedDevice: null });

    expect(prisma.$transaction).toHaveBeenCalledWith([
      { operation: 'consume-code' },
      { operation: 'verify-session' },
    ]);
    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: {
        status: AuthChallengeStatus.CONSUMED,
        consumedAt: new Date('2026-08-30T12:00:00.000Z'),
      },
    });
  });
});
