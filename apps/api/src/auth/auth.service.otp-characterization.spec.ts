import { createHmac } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { AuthChallengeStatus } from '@prisma/client';
import type { PosDeviceCredentialVerifierPort } from '../pos/public-api';
import { AuthService } from './auth.service';
import { ChallengeEngine } from './challenge-engine.service';

type AuthLifecycleNotificationTestSeam = {
  notifyRegistrationWelcome(user: {
    id: string;
    userStableId: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    language: 'ZH' | 'EN';
  }): void;
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
    const challengeEngine = new ChallengeEngine();
    const authChallengeDelivery = {
      sendLoginTwoFactorSms: jest.fn(),
      sendLoginTwoFactorEmail: jest.fn(),
      sendPhoneEnrollmentSms: jest.fn(),
      sendMembershipLoginSms: jest.fn(),
    };
    const customerLifecycleNotification = {
      notifyRegistrationWelcome: jest.fn().mockResolvedValue(undefined),
    };
    const otpPolicy = {
      checkSend: jest.fn().mockResolvedValue({ ok: true }),
      revokeSupersededCodes: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(
      prisma as never,
      authChallengeDelivery as never,
      customerLifecycleNotification as never,
      {} as never,
      challengeEngine,
      { verifyCredentials: jest.fn() } as never,
      otpPolicy as never,
    );

    return {
      service,
      prisma,
      challengeEngine,
      authChallengeDelivery,
      customerLifecycleNotification,
      otpPolicy,
    };
  };

  const session = {
    id: 'session-db-id',
    sessionId: 'session-id',
    mfaVerifiedAt: null,
    user: {
      id: 'user-db-id',
      userStableId: 'c1234567890abcdefghijklmn',
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

  it('maps registration welcome to stable identity', () => {
    const { service, customerLifecycleNotification } = createService();

    (
      service as unknown as AuthLifecycleNotificationTestSeam
    ).notifyRegistrationWelcome({
      id: 'user-db-id',
      userStableId: 'customer-stable-1',
      email: 'member@example.com',
      phone: '+14165550100',
      firstName: 'San',
      lastName: 'Qin',
      language: 'ZH',
    });

    expect(
      customerLifecycleNotification.notifyRegistrationWelcome,
    ).toHaveBeenCalledWith({
      userStableId: 'customer-stable-1',
      email: 'member@example.com',
      phone: '+14165550100',
      firstName: 'San',
      lastName: 'Qin',
      language: 'ZH',
    });
  });

  it('selects the zero-padded OTP profile when creating an SMS challenge', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma, challengeEngine, authChallengeDelivery } =
      createService();
    jest.spyOn(service, 'getSession').mockResolvedValue(session as never);
    prisma.authChallenge.findFirst.mockResolvedValue(null);
    prisma.authChallenge.count.mockResolvedValue(0);
    prisma.authChallenge.create.mockResolvedValue({ id: 'challenge-1' });
    prisma.authChallenge.update.mockResolvedValue({ id: 'challenge-1' });
    const generateCodeSpy = jest
      .spyOn(challengeEngine, 'generateCode')
      .mockReturnValue('000042');
    const hashCodeSpy = jest
      .spyOn(challengeEngine, 'hashCode')
      .mockReturnValue('code-hash');
    authChallengeDelivery.sendLoginTwoFactorSms.mockResolvedValue({
      ok: true,
      sendId: 'send-1',
    });

    await expect(
      service.requestTwoFactorSms({ sessionId: 'session-id' }),
    ).resolves.toEqual({
      success: true,
      expiresAt: new Date('2026-08-30T12:05:00.000Z'),
    });

    expect(generateCodeSpy).toHaveBeenCalledWith('ZERO_PADDED');
    expect(hashCodeSpy).toHaveBeenCalledWith('000042', 'OTP');
    expect(authChallengeDelivery.sendLoginTwoFactorSms).toHaveBeenCalledWith({
      phone: '+14165550100',
      code: '000042',
      expiresInMin: 5,
      locale: 'en',
      userStableId: 'c1234567890abcdefghijklmn',
    });
    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: { messagingSendId: 'send-1' },
    });
  });

  it('blocks an SMS request when the shared 2FA policy reports cooldown', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, otpPolicy } = createService();
    jest.spyOn(service, 'getSession').mockResolvedValue(session as never);
    otpPolicy.checkSend.mockResolvedValue({
      ok: false,
      violation: 'COOLDOWN',
    });

    await expect(
      service.requestTwoFactorSms({ sessionId: 'session-id' }),
    ).rejects.toThrow(
      new BadRequestException('too many requests, please try later'),
    );

    expect(otpPolicy.checkSend).toHaveBeenCalledWith({
      profile: 'LOGIN_2FA',
      purpose: 'LOGIN_2FA',
      now: new Date('2026-08-30T12:00:00.000Z'),
      userId: 'user-db-id',
      addressNorm: '+14165550100',
      ip: undefined,
    });
  });

  it('uses the same cross-channel 2FA policy for email challenges', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, otpPolicy } = createService();
    jest.spyOn(service, 'getSession').mockResolvedValue(session as never);
    otpPolicy.checkSend.mockResolvedValue({
      ok: false,
      violation: 'COOLDOWN',
    });

    await expect(
      service.requestTwoFactorEmail({ sessionId: 'session-id' }),
    ).rejects.toThrow('too many requests, please try later');

    expect(otpPolicy.checkSend).toHaveBeenCalledWith({
      profile: 'LOGIN_2FA',
      purpose: 'LOGIN_2FA',
      now: new Date('2026-08-30T12:00:00.000Z'),
      userId: 'user-db-id',
      addressNorm: 'admin@example.com',
      ip: undefined,
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

describe('AuthService POS device authentication boundary', () => {
  function createPosLoginService(
    verifyCredentials: jest.MockedFunction<
      PosDeviceCredentialVerifierPort['verifyCredentials']
    > = jest.fn().mockResolvedValue(null),
  ) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ role: 'STAFF' }),
      },
    };
    const service = new AuthService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { verifyCredentials } as never,
      {} as never,
    );
    return { service, verifyCredentials };
  }

  it('delegates POS device credentials to the POS-owned verifier', async () => {
    const { service, verifyCredentials } = createPosLoginService();

    await expect(
      service.loginWithPassword({
        email: 'staff@example.com',
        password: 'staff-password',
        purpose: 'pos',
        posDeviceStableId: 'device-1',
        posDeviceKey: 'device-secret',
      }),
    ).rejects.toThrow('POS device not authorized');

    expect(verifyCredentials).toHaveBeenCalledWith({
      deviceStableId: 'device-1',
      deviceKey: 'device-secret',
    });
  });

  it('rejects missing POS credentials before calling the POS verifier', async () => {
    const { service, verifyCredentials } = createPosLoginService();

    await expect(
      service.loginWithPassword({
        email: 'staff@example.com',
        password: 'staff-password',
        purpose: 'pos',
      }),
    ).rejects.toThrow('Missing POS device credentials');

    expect(verifyCredentials).not.toHaveBeenCalled();
  });
});
