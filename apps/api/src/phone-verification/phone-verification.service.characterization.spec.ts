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
    const phoneVerificationDelivery = {
      sendVerificationSms: jest.fn(),
    };
    const challengeEngine = new ChallengeEngine();
    const otpPolicy = {
      checkSend: jest.fn().mockResolvedValue({ ok: true }),
      revokeSupersededCodes: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PhoneVerificationService(
      prisma as never,
      phoneVerificationDelivery as never,
      challengeEngine,
      otpPolicy as never,
    );

    return {
      service,
      prisma,
      phoneVerificationDelivery,
      challengeEngine,
      otpPolicy,
    };
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
    const { service, prisma, phoneVerificationDelivery, challengeEngine } =
      createService();
    prisma.authChallenge.count.mockResolvedValue(0);
    prisma.authChallenge.create.mockResolvedValue({ id: 'challenge-1' });
    prisma.authChallenge.update.mockResolvedValue({ id: 'challenge-1' });
    const generateCodeSpy = jest
      .spyOn(challengeEngine, 'generateCode')
      .mockReturnValue('100000');
    const hashCodeSpy = jest
      .spyOn(challengeEngine, 'hashCode')
      .mockReturnValue('code-hash');
    phoneVerificationDelivery.sendVerificationSms.mockResolvedValue({
      ok: true,
      sendId: 'send-1',
    });

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
        ip: undefined,
      },
    });
    expect(phoneVerificationDelivery.sendVerificationSms).toHaveBeenCalledWith({
      phone: '14165550100',
      code: '100000',
      expiresInMin: 10,
      locale: undefined,
      purpose: 'checkout',
    });
    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: { messagingSendId: 'send-1' },
    });
  });

  it('records the delivery send id and preserves sms_send_failed on provider failure', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma, phoneVerificationDelivery, challengeEngine } =
      createService();
    prisma.authChallenge.count.mockResolvedValue(0);
    prisma.authChallenge.create.mockResolvedValue({ id: 'challenge-failed' });
    prisma.authChallenge.update.mockResolvedValue({ id: 'challenge-failed' });
    jest.spyOn(challengeEngine, 'generateCode').mockReturnValue('123456');
    phoneVerificationDelivery.sendVerificationSms.mockResolvedValue({
      ok: false,
      sendId: 'send-failed',
      error: 'suppressed',
    });

    await expect(
      service.sendCode({
        phone: '+14165550100',
        locale: 'en',
        purpose: 'membership-bind',
      }),
    ).resolves.toEqual({ ok: false, error: 'sms_send_failed' });

    expect(phoneVerificationDelivery.sendVerificationSms).toHaveBeenCalledWith({
      phone: '14165550100',
      code: '123456',
      expiresInMin: 10,
      locale: 'en',
      purpose: 'membership-bind',
    });
    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-failed' },
      data: {
        messagingSendId: 'send-failed',
        status: AuthChallengeStatus.REVOKED,
        consumedAt: new Date('2026-08-30T12:00:00.000Z'),
      },
    });
  });

  it('delegates checkout address and IP limiting to the shared OTP policy', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma, phoneVerificationDelivery, otpPolicy } =
      createService();
    otpPolicy.checkSend.mockResolvedValue({
      ok: false,
      violation: 'DAILY_LIMIT',
    });

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

    expect(otpPolicy.checkSend).toHaveBeenCalledWith({
      profile: 'CHECKOUT',
      purpose: 'checkout',
      now: new Date('2026-08-30T12:00:00.000Z'),
      addressNorm: '+14165550100',
      ip: '203.0.113.10',
    });
    expect(prisma.authChallenge.create).not.toHaveBeenCalled();
    expect(
      phoneVerificationDelivery.sendVerificationSms,
    ).not.toHaveBeenCalled();
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
