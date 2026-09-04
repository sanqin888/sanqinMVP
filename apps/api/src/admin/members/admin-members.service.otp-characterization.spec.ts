import { createHash, createHmac } from 'crypto';
import {
  AuthChallengeStatus,
  AuthChallengeType,
  MessagingChannel,
} from '@prisma/client';
import { ChallengeEngine } from '../../auth/challenge-engine.service';
import { AdminMembersService } from './admin-members.service';

type AdminMembersTestSeam = {
  getUserByStableId(userStableId: string): Promise<unknown>;
};

describe('AdminMembersService recharge OTP characterization', () => {
  const originalOtpSecret = process.env.OTP_SECRET;

  const createService = () => {
    const prisma = {
      authChallenge: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const loyalty = {
      applyTopup: jest.fn(),
    };
    const loyaltyPolicyReader = {
      getLoyaltyPolicySnapshot: jest.fn(),
    };
    const phoneVerification = {
      sendCode: jest.fn(),
      verifyCode: jest.fn(),
    };
    const memberRechargeEmailDelivery = {
      sendRechargeVerificationEmail: jest.fn(),
    };
    const challengeEngine = new ChallengeEngine();
    const service = new AdminMembersService(
      prisma as never,
      loyalty as never,
      loyaltyPolicyReader as never,
      {} as never,
      phoneVerification as never,
      memberRechargeEmailDelivery as never,
      challengeEngine,
    );

    return {
      service,
      prisma,
      loyalty,
      phoneVerification,
      memberRechargeEmailDelivery,
      challengeEngine,
    };
  };

  const emailMember = {
    id: 'user-db-id',
    userStableId: 'member-stable-id',
    email: 'Member@Example.com',
    phone: '+14165550100',
  };

  const mockMember = (service: AdminMembersService, member: unknown) =>
    jest
      .spyOn(service as unknown as AdminMembersTestSeam, 'getUserByStableId')
      .mockResolvedValue(member);

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    if (originalOtpSecret === undefined) {
      delete process.env.OTP_SECRET;
    } else {
      process.env.OTP_SECRET = originalOtpSecret;
    }
  });

  it('creates each email recharge code without a service-level rate-limit query', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma, memberRechargeEmailDelivery, challengeEngine } =
      createService();
    mockMember(service, emailMember);
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
      service.sendRechargeCode('member-stable-id', {
        email: 'member@example.com',
        locale: 'en',
      }),
    ).resolves.toEqual({ ok: true });

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

  it('preserves email_send_failed when recharge delivery fails without a provider error', async () => {
    const { service, prisma, memberRechargeEmailDelivery, challengeEngine } =
      createService();
    mockMember(service, emailMember);
    jest.spyOn(challengeEngine, 'generateCode').mockReturnValue('123456');
    prisma.authChallenge.create.mockResolvedValue({ id: 'challenge-failed' });
    memberRechargeEmailDelivery.sendRechargeVerificationEmail.mockResolvedValue(
      {
        ok: false,
        sendId: 'send-failed',
      },
    );

    await expect(
      service.sendRechargeCode('member-stable-id', {
        email: 'member@example.com',
        locale: 'zh-CN',
      }),
    ).resolves.toEqual({ ok: false, error: 'email_send_failed' });

    expect(prisma.authChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-failed' },
      data: { messagingSendId: 'send-failed' },
    });
  });

  it('increments attempts and revokes an email recharge code on the final mismatch', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma } = createService();
    process.env.OTP_SECRET = 'admin-secret';
    mockMember(service, emailMember);
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
      service.verifyRechargeCode('member-stable-id', {
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
    mockMember(service, emailMember);
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

    const result = await service.verifyRechargeCode('member-stable-id', {
      email: 'member@example.com',
      code: '123456',
    });
    const verificationToken =
      'verificationToken' in result ? result.verificationToken : '';

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

  it('delegates phone recharge verification to PhoneVerificationService', async () => {
    const { service, phoneVerification } = createService();
    mockMember(service, {
      ...emailMember,
      email: null,
    });
    phoneVerification.verifyCode.mockResolvedValue({
      ok: true,
      verificationToken: 'phone-token',
    });

    await expect(
      service.verifyRechargeCode('member-stable-id', {
        phone: '+1 416 555 0100',
        code: '123456',
      }),
    ).resolves.toEqual({ ok: true, verificationToken: 'phone-token' });

    expect(phoneVerification.verifyCode).toHaveBeenCalledWith({
      phone: '+1 416 555 0100',
      code: '123456',
      purpose: 'pos-recharge',
    });
  });

  it('atomically claims a recharge token before applying the top-up', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    const { service, prisma, loyalty } = createService();
    mockMember(service, emailMember);
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'token-challenge-1',
      purpose: 'pos-recharge',
      addressNorm: 'member@example.com',
      expiresAt: new Date('2026-08-30T12:10:00.000Z'),
    });
    prisma.authChallenge.updateMany.mockResolvedValue({ count: 1 });
    loyalty.applyTopup.mockResolvedValue({ balanceCents: 5000 });

    await expect(
      service.rechargeWithVerification('member-stable-id', {
        amountCents: 5000,
        verificationToken: 'single-use-token',
        idempotencyKey: 'topup-1',
      }),
    ).resolves.toEqual({
      userStableId: 'member-stable-id',
      balanceCents: 5000,
    });

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
    expect(loyalty.applyTopup).toHaveBeenCalledWith({
      userStableId: 'member-stable-id',
      amountCents: 5000,
      bonusPoints: undefined,
      idempotencyKey: 'topup-1',
    });
    expect(
      prisma.authChallenge.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(loyalty.applyTopup.mock.invocationCallOrder[0]);
  });

  it('rejects a recharge token that another request already consumed', async () => {
    const { service, prisma, loyalty } = createService();
    mockMember(service, emailMember);
    prisma.authChallenge.findFirst.mockResolvedValue({
      id: 'token-challenge-1',
      purpose: 'pos-recharge',
      addressNorm: 'member@example.com',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    prisma.authChallenge.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.rechargeWithVerification('member-stable-id', {
        amountCents: 5000,
        verificationToken: 'already-used-token',
      }),
    ).rejects.toThrow('verificationToken already used');

    expect(loyalty.applyTopup).not.toHaveBeenCalled();
  });
});
