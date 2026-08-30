import { createHash, createHmac } from 'crypto';
import {
  AuthChallengeStatus,
  AuthChallengeType,
  MessagingChannel,
} from '@prisma/client';
import { ChallengeEngine } from '../auth/challenge-engine.service';
import { PhoneVerificationService } from './phone-verification.service';

describe('PhoneVerificationService OTP characterization', () => {
  const originalPhoneSecret = process.env.PHONE_VERIFICATION_SECRET;

  const createService = () => {
    const prisma = {
      authChallenge: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const smsService = {
      sendSms: jest.fn(),
    };
    const templateRenderer = {
      renderSms: jest.fn().mockResolvedValue('verification message'),
    };
    const businessConfigService = {
      getMessagingSnapshot: jest
        .fn()
        .mockResolvedValue({ baseVars: { storeName: 'SanQin' } }),
    };
    const challengeEngine = new ChallengeEngine();
    const service = new PhoneVerificationService(
      prisma as never,
      smsService as never,
      templateRenderer as never,
      businessConfigService as never,
      challengeEngine,
    );

    return { service, prisma, smsService, challengeEngine };
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    if (originalPhoneSecret === undefined) {
      delete process.env.PHONE_VERIFICATION_SECRET;
    } else {
      process.env.PHONE_VERIFICATION_SECRET = originalPhoneSecret;
    }
  });

  it('selects the non-zero phone-secret profile when creating a challenge', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma, smsService, challengeEngine } = createService();
    prisma.authChallenge.count.mockResolvedValue(0);
    prisma.authChallenge.create.mockResolvedValue({ id: 'challenge-1' });
    prisma.authChallenge.update.mockResolvedValue({ id: 'challenge-1' });
    const generateCodeSpy = jest
      .spyOn(challengeEngine, 'generateCode')
      .mockReturnValue('100000');
    const hashCodeSpy = jest
      .spyOn(challengeEngine, 'hashCode')
      .mockReturnValue('code-hash');
    smsService.sendSms.mockResolvedValue({ ok: true, sendId: 'send-1' });

    await expect(
      service.sendCode({
        phone: '+1 416 555 0100',
        purpose: 'checkout',
      }),
    ).resolves.toEqual({ ok: true });

    expect(generateCodeSpy).toHaveBeenCalledWith('NON_ZERO_SIX_DIGIT');
    expect(hashCodeSpy).toHaveBeenCalledWith('100000', 'PHONE_VERIFICATION');
    expect(prisma.authChallenge.create).toHaveBeenCalledWith({
      data: {
        type: AuthChallengeType.PHONE_VERIFY,
        status: AuthChallengeStatus.PENDING,
        channel: MessagingChannel.SMS,
        addressNorm: '+14165550100',
        addressRaw: '+1 416 555 0100',
        codeHash: 'code-hash',
        expiresAt: new Date('2026-08-30T12:10:00.000Z'),
        purpose: 'checkout',
      },
    });
  });

  it('counts the IP attempt before the daily limit check', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma, smsService } = createService();
    prisma.authChallenge.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(0);

    await expect(
      service.sendCode({
        phone: '+1 416 555 0100',
        purpose: 'checkout',
        ip: '203.0.113.10',
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'too many requests in a day',
    });

    await expect(
      service.sendCode({
        phone: '+1 416 555 0100',
        purpose: 'different-purpose',
        ip: '203.0.113.10',
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'too many requests, please try later',
    });

    expect(prisma.authChallenge.count).toHaveBeenCalledTimes(1);
    expect(prisma.authChallenge.count).toHaveBeenCalledWith({
      where: {
        type: AuthChallengeType.PHONE_VERIFY,
        channel: MessagingChannel.SMS,
        addressNorm: '+14165550100',
        createdAt: { gt: new Date('2026-08-29T12:00:00.000Z') },
      },
    });
    expect(prisma.authChallenge.create).not.toHaveBeenCalled();
    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it('increments attempts and revokes a challenge on the final mismatch', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma } = createService();
    process.env.PHONE_VERIFICATION_SECRET = 'phone-secret';
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1',
      codeHash: createHmac('sha256', 'phone-secret')
        .update('654321')
        .digest('hex'),
      attempts: 4,
      maxAttempts: 5,
      expiresAt: new Date('2026-08-30T12:10:00.000Z'),
    });

    await expect(
      service.verifyCode({
        phone: '+14165550100',
        code: '123456',
        purpose: 'checkout',
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

  it('marks an expired challenge before comparing its code', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1',
      expiresAt: new Date('2026-08-30T11:59:59.000Z'),
    });

    await expect(
      service.verifyCode({ phone: '+14165550100', code: '123456' }),
    ).resolves.toEqual({ ok: false, error: 'code_expired' });

    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: {
        status: AuthChallengeStatus.EXPIRED,
        consumedAt: new Date('2026-08-30T12:00:00.000Z'),
      },
    });
  });

  it('consumes a matching code and creates a pending token with the same expiry', async () => {
    const { service, prisma } = createService();
    process.env.PHONE_VERIFICATION_SECRET = 'phone-secret';
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'challenge-1',
      codeHash: createHmac('sha256', 'phone-secret')
        .update('123456')
        .digest('hex'),
      attempts: 0,
      maxAttempts: 5,
      expiresAt,
    });
    prisma.authChallenge.update.mockReturnValue({ operation: 'consume-code' });
    prisma.authChallenge.create.mockReturnValue({ operation: 'create-token' });

    const result = await service.verifyCode({
      phone: '+1 416 555 0100',
      code: ' 123456 ',
      purpose: 'checkout',
    });

    expect(result.ok).toBe(true);
    expect(result.verificationToken).toMatch(/^[0-9a-f]{64}$/);
    expect(prisma.authChallenge.create).toHaveBeenCalledWith({
      data: {
        type: AuthChallengeType.PHONE_VERIFY,
        status: AuthChallengeStatus.PENDING,
        channel: MessagingChannel.SMS,
        addressNorm: '+14165550100',
        addressRaw: '+1 416 555 0100',
        purpose: 'checkout',
        expiresAt,
        tokenHash: createHash('sha256')
          .update(result.verificationToken ?? '')
          .digest('hex'),
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      { operation: 'consume-code' },
      { operation: 'create-token' },
    ]);
  });
});
