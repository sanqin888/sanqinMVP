import { Inject, Injectable } from '@nestjs/common';
import {
  AuthChallengeStatus,
  AuthChallengeType,
  MessagingChannel,
} from '@prisma/client';

import { normalizePhone } from '../common/utils/phone';
import {
  MEMBER_RECHARGE_EMAIL_DELIVERY,
  type MemberRechargeEmailDeliveryPort,
} from '../email/public-api';
import {
  PHONE_VERIFICATION_DELIVERY,
  type PhoneVerificationDeliveryPort,
} from '../messaging/public-api';
import {
  IDENTITY_CHALLENGE_ENGINE,
  type IdentityChallengeEnginePort,
} from './challenge-engine.port';
import { normalizeEmail } from './email-normalization';
import { PrismaService } from './identity-prisma';
import { OtpChallengePolicyService } from './otp-challenge-policy.service';
import {
  MemberRechargeVerificationError,
  type MemberRechargeConsumeTokenInput,
  type MemberRechargeSendCodeInput,
  type MemberRechargeVerificationPort,
  type MemberRechargeVerificationResult,
  type MemberRechargeVerifyCodeInput,
} from './member-recharge-verification.contract';

const POS_RECHARGE_PURPOSE = 'pos-recharge';
const RECHARGE_CODE_TTL_MS = 10 * 60 * 1000;

const RECHARGE_COOLDOWN_ERROR = 'too many requests, please try later';
const RECHARGE_DAILY_LIMIT_ERROR = 'too many requests in a day';

type RechargeMember = {
  id: string;
  userStableId: string;
  email: string | null;
  phone: string | null;
};

type RechargeContact =
  | {
      kind: 'EMAIL';
      addressNorm: string;
      addressRaw: string;
    }
  | {
      kind: 'SMS';
      addressNorm: string;
      addressRaw: string;
    };

@Injectable()
export class MemberRechargeVerificationService implements MemberRechargeVerificationPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PHONE_VERIFICATION_DELIVERY)
    private readonly phoneVerificationDelivery: PhoneVerificationDeliveryPort,
    @Inject(MEMBER_RECHARGE_EMAIL_DELIVERY)
    private readonly memberRechargeEmailDelivery: MemberRechargeEmailDeliveryPort,
    @Inject(IDENTITY_CHALLENGE_ENGINE)
    private readonly challengeEngine: IdentityChallengeEnginePort,
    private readonly otpPolicy: OtpChallengePolicyService,
  ) {}

  private async requireMember(userStableId: string): Promise<RechargeMember> {
    const stable = userStableId.trim();
    if (!stable) {
      throw new MemberRechargeVerificationError(
        'USER_STABLE_ID_REQUIRED',
        'userStableId is required',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { userStableId: stable },
      select: {
        id: true,
        userStableId: true,
        email: true,
        phone: true,
      },
    });

    if (!user) {
      throw new MemberRechargeVerificationError(
        'USER_NOT_FOUND',
        'member not found',
      );
    }

    return user;
  }

  private resolveRechargeContact(params: {
    userEmail: string | null;
    userPhone: string | null;
    inputEmail?: string;
    inputPhone?: string;
  }): RechargeContact {
    const normalizedInputEmail = normalizeEmail(params.inputEmail);
    const normalizedUserEmail = normalizeEmail(params.userEmail);
    const normalizedInput = normalizePhone(params.inputPhone);
    const normalizedUser = normalizePhone(params.userPhone);

    if (normalizedUserEmail) {
      if (
        normalizedInputEmail &&
        normalizedInputEmail !== normalizedUserEmail
      ) {
        throw new MemberRechargeVerificationError(
          'EMAIL_MISMATCH',
          'email does not match member profile',
        );
      }
      return {
        kind: 'EMAIL',
        addressNorm: normalizedUserEmail,
        addressRaw: params.userEmail ?? normalizedUserEmail,
      };
    }

    if (normalizedInput) {
      if (normalizedUser && normalizedInput !== normalizedUser) {
        throw new MemberRechargeVerificationError(
          'PHONE_MISMATCH',
          'phone does not match member profile',
        );
      }
      const addressNorm = normalizedInput.startsWith('+')
        ? normalizedInput
        : `+${normalizedInput}`;
      return {
        kind: 'SMS',
        addressNorm,
        addressRaw: params.inputPhone ?? normalizedInput,
      };
    }

    if (normalizedUser) {
      const addressNorm = normalizedUser.startsWith('+')
        ? normalizedUser
        : `+${normalizedUser}`;
      return {
        kind: 'SMS',
        addressNorm,
        addressRaw: params.userPhone ?? normalizedUser,
      };
    }

    throw new MemberRechargeVerificationError(
      'CONTACT_MISSING',
      'member does not have an email or phone',
    );
  }

  private challengeType(contact: RechargeContact): AuthChallengeType {
    return contact.kind === 'EMAIL'
      ? AuthChallengeType.EMAIL_VERIFY
      : AuthChallengeType.PHONE_VERIFY;
  }

  private challengeChannel(contact: RechargeContact): MessagingChannel {
    return contact.kind === 'EMAIL'
      ? MessagingChannel.EMAIL
      : MessagingChannel.SMS;
  }

  async sendCode(
    input: MemberRechargeSendCodeInput,
  ): Promise<MemberRechargeVerificationResult> {
    const user = await this.requireMember(input.userStableId);
    const contact = this.resolveRechargeContact({
      userEmail: user.email,
      userPhone: user.phone,
      inputEmail: input.email,
      inputPhone: input.phone,
    });
    const now = new Date();
    const limitResult = await this.otpPolicy.checkSend({
      profile: 'POS_RECHARGE',
      purpose: POS_RECHARGE_PURPOSE,
      now,
      userId: user.id,
      addressNorm: contact.addressNorm,
    });
    if (!limitResult.ok) {
      return {
        ok: false,
        error:
          limitResult.violation === 'COOLDOWN'
            ? RECHARGE_COOLDOWN_ERROR
            : RECHARGE_DAILY_LIMIT_ERROR,
      };
    }

    const code = this.challengeEngine.generateCode('NON_ZERO_SIX_DIGIT');
    const expiresAt = this.challengeEngine.expiresAt(now, RECHARGE_CODE_TTL_MS);
    const challenge = await this.prisma.authChallenge.create({
      data: {
        userId: user.id,
        type: this.challengeType(contact),
        status: AuthChallengeStatus.PENDING,
        channel: this.challengeChannel(contact),
        addressNorm: contact.addressNorm,
        addressRaw: contact.addressRaw,
        codeHash: this.challengeEngine.hashCode(code, 'MEMBER_RECHARGE'),
        purpose: POS_RECHARGE_PURPOSE,
        expiresAt,
      },
    });

    if (contact.kind === 'EMAIL') {
      const sendResult =
        await this.memberRechargeEmailDelivery.sendRechargeVerificationEmail({
          to: contact.addressNorm,
          code,
          expiresInMin: 10,
          locale: input.locale,
          userStableId: user.userStableId,
        });

      await this.prisma.authChallenge.update({
        where: { id: challenge.id },
        data: sendResult.ok
          ? { messagingSendId: sendResult.sendId }
          : {
              messagingSendId: sendResult.sendId,
              ...this.challengeEngine.revokedState(now),
            },
      });

      if (!sendResult.ok) {
        return { ok: false, error: sendResult.error ?? 'email_send_failed' };
      }

      await this.otpPolicy.revokeSupersededCodes({
        profile: 'POS_RECHARGE',
        purpose: POS_RECHARGE_PURPOSE,
        now,
        userId: user.id,
        addressNorm: contact.addressNorm,
        currentChallengeId: challenge.id,
      });

      return { ok: true };
    }

    const sendResult = await this.phoneVerificationDelivery.sendVerificationSms(
      {
        phone: contact.addressRaw,
        code,
        expiresInMin: 10,
        locale: input.locale,
        purpose: POS_RECHARGE_PURPOSE,
      },
    );

    await this.prisma.authChallenge.update({
      where: { id: challenge.id },
      data: sendResult.ok
        ? { messagingSendId: sendResult.sendId }
        : {
            messagingSendId: sendResult.sendId,
            ...this.challengeEngine.revokedState(now),
          },
    });

    if (!sendResult.ok) {
      return { ok: false, error: 'sms_send_failed' };
    }

    await this.otpPolicy.revokeSupersededCodes({
      profile: 'POS_RECHARGE',
      purpose: POS_RECHARGE_PURPOSE,
      now,
      userId: user.id,
      addressNorm: contact.addressNorm,
      currentChallengeId: challenge.id,
    });

    return { ok: true };
  }

  async verifyCode(
    input: MemberRechargeVerifyCodeInput,
  ): Promise<MemberRechargeVerificationResult> {
    const code = typeof input.code === 'string' ? input.code.trim() : '';
    if (!code) {
      throw new MemberRechargeVerificationError(
        'CODE_REQUIRED',
        'code is required',
      );
    }

    const user = await this.requireMember(input.userStableId);
    const contact = this.resolveRechargeContact({
      userEmail: user.email,
      userPhone: user.phone,
      inputEmail: input.email,
      inputPhone: input.phone,
    });
    const now = new Date();
    const latest = await this.prisma.authChallenge.findFirst({
      where: {
        userId: user.id,
        type: this.challengeType(contact),
        channel: this.challengeChannel(contact),
        addressNorm: contact.addressNorm,
        purpose: POS_RECHARGE_PURPOSE,
        status: AuthChallengeStatus.PENDING,
        codeHash: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) {
      return { ok: false, error: 'code_not_found' };
    }

    if (latest.expiresAt.getTime() < now.getTime()) {
      await this.prisma.authChallenge.update({
        where: { id: latest.id },
        data: this.challengeEngine.expiredState(now),
      });
      return { ok: false, error: 'code_expired' };
    }

    if (
      !this.challengeEngine.verifyCodeHash(
        code,
        latest.codeHash ?? '',
        'MEMBER_RECHARGE',
      )
    ) {
      const failedState = this.challengeEngine.failedAttemptState({
        attempts: latest.attempts,
        maxAttempts: latest.maxAttempts,
        now,
      });
      await this.prisma.authChallenge.update({
        where: { id: latest.id },
        data: failedState,
      });
      return { ok: false, error: 'code_invalid' };
    }

    const verificationToken = this.challengeEngine.generateVerificationToken();
    const tokenHash =
      this.challengeEngine.hashVerificationToken(verificationToken);

    await this.prisma.$transaction([
      this.prisma.authChallenge.update({
        where: { id: latest.id },
        data: this.challengeEngine.consumedState(now),
      }),
      this.prisma.authChallenge.create({
        data: {
          userId: user.id,
          type: this.challengeType(contact),
          status: AuthChallengeStatus.PENDING,
          channel: this.challengeChannel(contact),
          addressNorm: contact.addressNorm,
          addressRaw: contact.addressRaw,
          tokenHash,
          purpose: POS_RECHARGE_PURPOSE,
          expiresAt: latest.expiresAt,
        },
      }),
    ]);

    return {
      ok: true,
      verificationToken,
    };
  }

  async consumeVerificationToken(
    input: MemberRechargeConsumeTokenInput,
  ): Promise<void> {
    const verificationToken = input.verificationToken.trim();
    if (!verificationToken) {
      throw new MemberRechargeVerificationError(
        'VERIFICATION_TOKEN_REQUIRED',
        'verificationToken is required',
      );
    }

    const user = await this.requireMember(input.userStableId);
    const contact = this.resolveRechargeContact({
      userEmail: user.email,
      userPhone: user.phone,
    });
    const now = new Date();
    const tokenHash =
      this.challengeEngine.hashVerificationToken(verificationToken);

    const record = await this.prisma.authChallenge.findFirst({
      where: {
        userId: user.id,
        tokenHash,
        type: this.challengeType(contact),
        channel: this.challengeChannel(contact),
        purpose: POS_RECHARGE_PURPOSE,
        status: AuthChallengeStatus.PENDING,
        addressNorm: contact.addressNorm,
      },
    });

    if (!record) {
      throw new MemberRechargeVerificationError(
        'VERIFICATION_TOKEN_INVALID',
        'verificationToken is invalid',
      );
    }

    if (record.expiresAt.getTime() < now.getTime()) {
      throw new MemberRechargeVerificationError(
        'VERIFICATION_TOKEN_EXPIRED',
        'verificationToken has expired',
      );
    }

    const updated = await this.prisma.authChallenge.updateMany({
      where: {
        id: record.id,
        status: AuthChallengeStatus.PENDING,
        purpose: POS_RECHARGE_PURPOSE,
      },
      data: this.challengeEngine.consumedState(now),
    });

    if (updated.count === 0) {
      throw new MemberRechargeVerificationError(
        'VERIFICATION_TOKEN_ALREADY_USED',
        'verificationToken already used',
      );
    }
  }
}
