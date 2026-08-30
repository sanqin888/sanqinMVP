import { createHmac } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import {
  AuthChallengeStatus,
  AuthChallengeType,
  MessagingChannel,
} from '@prisma/client';
import { AuthService } from './auth.service';
import { ChallengeEngine } from './challenge-engine.service';

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
    const challengeEngine = new ChallengeEngine();
    const emailService = { sendEmail: jest.fn() };
    const smsService = { sendSms: jest.fn() };
    const templateRenderer = {
      renderEmail: jest.fn(),
      renderSms: jest.fn(),
    };
    const businessConfigService = { getMessagingSnapshot: jest.fn() };
    const service = new AuthService(
      prisma as never,
      emailService as never,
      smsService as never,
      templateRenderer as never,
      businessConfigService as never,
      {} as never,
      {} as never,
      challengeEngine,
    );

    return {
      service,
      prisma,
      challengeEngine,
      smsService,
      templateRenderer,
      businessConfigService,
    };
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

  it('selects the zero-padded OTP profile when creating an SMS challenge', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const {
      service,
      prisma,
      challengeEngine,
      smsService,
      templateRenderer,
      businessConfigService,
    } = createService();
    jest.spyOn(service, 'getSession').mockResolvedValue(session as never);
    prisma.authChallenge.findFirst.mockResolvedValue(null);
    prisma.authChallenge.count.mockResolvedValue(0);
    prisma.authChallenge.create.mockResolvedValue({ id: 'challenge-1' });
    prisma.authChallenge.update.mockResolvedValue({ id: 'challenge-1' });
    jest.spyOn(challengeEngine, 'generateCode').mockReturnValue('000042');
    jest.spyOn(challengeEngine, 'hashCode').mockReturnValue('code-hash');
    businessConfigService.getMessagingSnapshot.mockResolvedValue({
      baseVars: { storeName: 'SanQin' },
    });
    templateRenderer.renderSms.mockResolvedValue('verification message');
    smsService.sendSms.mockResolvedValue({ ok: true, sendId: 'send-1' });

    await expect(
      service.requestTwoFactorSms({ sessionId: 'session-id' }),
    ).resolves.toEqual({
      success: true,
      expiresAt: new Date('2026-08-30T12:05:00.000Z'),
    });

    expect(challengeEngine.generateCode).toHaveBeenCalledWith('ZERO_PADDED');
    expect(challengeEngine.hashCode).toHaveBeenCalledWith('000042', 'OTP');
  });

  it('blocks an SMS request when either SMS or email has a recent pending challenge', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma } = createService();
    jest.spyOn(service, 'getSession').mockResolvedValue(session as never);
    prisma.authChallenge.findFirst.mockResolvedValue({ id: 'recent-email' });

    await expect(
      service.requestTwoFactorSms({ sessionId: 'session-id' }),
    ).rejects.toThrow(
      new BadRequestException('too many requests, please try later'),
    );

    expect(prisma.authChallenge.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-db-id',
        type: AuthChallengeType.TWO_FACTOR,
        channel: {
          in: [MessagingChannel.SMS, MessagingChannel.EMAIL],
        },
        purpose: 'LOGIN_2FA',
        createdAt: { gt: new Date('2026-08-30T11:59:00.000Z') },
        status: AuthChallengeStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.authChallenge.count).not.toHaveBeenCalled();
  });

  it('uses an email-only recent-request check for email challenges', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma } = createService();
    jest.spyOn(service, 'getSession').mockResolvedValue(session as never);
    prisma.authChallenge.findFirst.mockResolvedValue({ id: 'recent-email' });

    await expect(
      service.requestTwoFactorEmail({ sessionId: 'session-id' }),
    ).rejects.toThrow('too many requests, please try later');

    expect(prisma.authChallenge.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-db-id',
        type: AuthChallengeType.TWO_FACTOR,
        channel: MessagingChannel.EMAIL,
        purpose: 'LOGIN_2FA',
        createdAt: { gt: new Date('2026-08-30T11:59:00.000Z') },
        status: AuthChallengeStatus.PENDING,
      },
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
