import { createHash, createHmac } from 'crypto';
import { ChallengeEngine } from './challenge-engine.service';

describe('ChallengeEngine', () => {
  const originalOtpSecret = process.env.OTP_SECRET;
  const originalPhoneSecret = process.env.PHONE_VERIFICATION_SECRET;
  const originalRechargeSecret = process.env.MEMBER_RECHARGE_OTP_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    jest.restoreAllMocks();

    if (originalOtpSecret === undefined) {
      delete process.env.OTP_SECRET;
    } else {
      process.env.OTP_SECRET = originalOtpSecret;
    }

    if (originalPhoneSecret === undefined) {
      delete process.env.PHONE_VERIFICATION_SECRET;
    } else {
      process.env.PHONE_VERIFICATION_SECRET = originalPhoneSecret;
    }

    if (originalRechargeSecret === undefined) {
      delete process.env.MEMBER_RECHARGE_OTP_SECRET;
    } else {
      process.env.MEMBER_RECHARGE_OTP_SECRET = originalRechargeSecret;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('uses the configured secret kind and keeps the non-production fallback', () => {
    const engine = new ChallengeEngine();
    process.env.NODE_ENV = 'test';
    process.env.OTP_SECRET = 'otp-secret';
    process.env.PHONE_VERIFICATION_SECRET = 'phone-secret';
    process.env.MEMBER_RECHARGE_OTP_SECRET = 'recharge-secret';

    expect(engine.hashCode('123456', 'OTP')).toBe(
      createHmac('sha256', 'otp-secret').update('123456').digest('hex'),
    );
    expect(engine.hashCode('123456', 'PHONE_VERIFICATION')).toBe(
      createHmac('sha256', 'phone-secret').update('123456').digest('hex'),
    );
    expect(engine.hashCode('123456', 'MEMBER_RECHARGE')).toBe(
      createHmac('sha256', 'recharge-secret').update('123456').digest('hex'),
    );

    delete process.env.OTP_SECRET;
    expect(engine.hashCode('123456', 'OTP')).toBe(
      createHmac('sha256', 'dev-secret').update('123456').digest('hex'),
    );
  });

  it('preserves both six-digit formats with cryptographic randomness', () => {
    const crypto = jest.requireActual<typeof import('crypto')>('crypto');
    const engine = new ChallengeEngine();
    const randomIntSpy = jest
      .spyOn(crypto, 'randomInt')
      .mockReturnValueOnce(42)
      .mockReturnValueOnce(100000)
      .mockReturnValueOnce(999999);

    expect(engine.generateCode('ZERO_PADDED')).toBe('000042');
    expect(engine.generateCode('NON_ZERO_SIX_DIGIT')).toBe('100000');
    expect(engine.generateCode('NON_ZERO_SIX_DIGIT')).toBe('999999');
    expect(randomIntSpy).toHaveBeenNthCalledWith(1, 0, 1_000_000);
    expect(randomIntSpy).toHaveBeenNthCalledWith(2, 100000, 1_000_000);
    expect(randomIntSpy).toHaveBeenNthCalledWith(3, 100000, 1_000_000);
  });

  it('refuses a missing OTP secret in production', () => {
    const engine = new ChallengeEngine();
    process.env.NODE_ENV = 'production';
    delete process.env.OTP_SECRET;

    expect(() => engine.hashCode('123456', 'OTP')).toThrow(
      'OTP_SECRET is required in production',
    );
  });

  it('refuses a missing phone verification secret in production', () => {
    const engine = new ChallengeEngine();
    process.env.NODE_ENV = 'production';
    delete process.env.PHONE_VERIFICATION_SECRET;

    expect(() => engine.hashCode('123456', 'PHONE_VERIFICATION')).toThrow(
      'PHONE_VERIFICATION_SECRET is required in production',
    );
  });

  it('refuses a missing member recharge secret in production', () => {
    const engine = new ChallengeEngine();
    process.env.NODE_ENV = 'production';
    delete process.env.MEMBER_RECHARGE_OTP_SECRET;

    expect(() => engine.hashCode('123456', 'MEMBER_RECHARGE')).toThrow(
      'MEMBER_RECHARGE_OTP_SECRET is required in production',
    );
  });

  it('verifies matching hashes and rejects mismatches without direct string comparison', () => {
    const engine = new ChallengeEngine();
    process.env.NODE_ENV = 'test';
    process.env.OTP_SECRET = 'otp-secret';
    const codeHash = engine.hashCode('123456', 'OTP');

    expect(engine.verifyCodeHash('123456', codeHash, 'OTP')).toBe(true);
    expect(engine.verifyCodeHash('654321', codeHash, 'OTP')).toBe(false);
    expect(engine.verifyCodeHash('123456', '', 'OTP')).toBe(false);
  });

  it('creates and hashes a 32-byte verification token', () => {
    const engine = new ChallengeEngine();
    const token = engine.generateVerificationToken();

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(engine.hashVerificationToken(token)).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
  });

  it('calculates windows, expiry and limit boundaries deterministically', () => {
    const engine = new ChallengeEngine();
    const now = new Date('2026-08-30T12:00:00.000Z');

    expect(engine.windowStart(now, 60_000)).toEqual(
      new Date('2026-08-30T11:59:00.000Z'),
    );
    expect(engine.expiresAt(now, 10 * 60_000)).toEqual(
      new Date('2026-08-30T12:10:00.000Z'),
    );
    expect(engine.limitReached(4, 5)).toBe(false);
    expect(engine.limitReached(5, 5)).toBe(true);
  });

  it('keeps pending attempts active and revokes the final failed attempt', () => {
    const engine = new ChallengeEngine();
    const now = new Date('2026-08-30T12:00:00.000Z');

    expect(
      engine.failedAttemptState({ attempts: 2, maxAttempts: 5, now }),
    ).toEqual({
      attempts: 3,
      status: 'PENDING',
      consumedAt: null,
    });
    expect(
      engine.failedAttemptState({ attempts: 4, maxAttempts: 5, now }),
    ).toEqual({
      attempts: 5,
      status: 'REVOKED',
      consumedAt: now,
    });
    expect(engine.expiredState(now)).toEqual({
      status: 'EXPIRED',
      consumedAt: now,
    });
    expect(engine.consumedState(now)).toEqual({
      status: 'CONSUMED',
      consumedAt: now,
    });
  });
});
