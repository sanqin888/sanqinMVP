// apps/api/src/phone-verification/phone-verification.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PhoneVerificationStatus } from '@prisma/client';
import { normalizePhone } from '../common/utils/phone';

type SendCodeResult = {
  ok: boolean;
  error?: string;
};

export type VerifyCodeResult = {
  ok: boolean;
  verificationToken?: string;
  error?: string;
};

@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 生成 6 位数字验证码 */
  private generateCode(): string {
    const n = Math.floor(100000 + Math.random() * 900000);
    return String(n);
  }

  /** 生成验证 token（给前端存起来） */
  private generateVerificationToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hashCode(code: string): string {
    const secret =
      process.env.PHONE_VERIFICATION_SECRET ??
      process.env.OTP_SECRET ??
      process.env.OAUTH_STATE_SECRET ??
      'dev-secret';
    return createHmac('sha256', secret).update(code).digest('hex');
  }

  private verifyCodeHash(code: string, codeHash: string): boolean {
    const computed = this.hashCode(code);
    if (computed.length !== codeHash.length) return false;
    return timingSafeEqual(
      Buffer.from(codeHash, 'hex'),
      Buffer.from(computed, 'hex'),
    );
  }

  /** 发送验证码（MVP: 只写入 DB + 日志，不真正发短信） */
  async sendCode(params: {
    phone: string;
    locale?: string;
    purpose?: string;
  }): Promise<SendCodeResult> {
    const { phone, purpose } = params;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      return { ok: false, error: 'phone is empty' };
    }
    const resolvedPurpose = purpose?.trim() || 'generic';

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 分钟有效

    const code = this.generateCode();
    const codeHash = this.hashCode(code);

    await this.prisma.phoneVerification.create({
      data: {
        phone: normalized,
        codeHash,
        status: PhoneVerificationStatus.PENDING,
        expiresAt,
        purpose: resolvedPurpose,
      },
    });

    // ⭐ 这里将来可以接入真正的短信服务商
    // 目前先打日志（注意生产环境不要把 code 打到日志里，如果介意安全）
    this.logger.log(
      `[DEV] Phone verification code ${code} sent to phone=${normalized}`,
    );

    // 如果你在开发环境想直接把 code 返回给前端方便测试，也可以这样：
    // if (process.env.NODE_ENV !== 'production') {
    //   return { ok: true, devCode: code } as any;
    // }

    return { ok: true };
  }

  /** 校验验证码，成功时返回 verificationToken（用来给前端存起来） */
  async verifyCode(params: {
    phone: string;
    code: string;
    purpose?: string;
  }): Promise<VerifyCodeResult> {
    const { phone, code, purpose } = params;
    const normalized = normalizePhone(phone);
    const codeTrimmed = code.trim();
    const resolvedPurpose = purpose?.trim() || 'generic';

    if (!normalized || !codeTrimmed) {
      return { ok: false, error: 'phone or code is empty' };
    }

    const now = new Date();

    // 找到该手机号最近一次验证码记录
    const latest = await this.prisma.phoneVerification.findFirst({
      where: {
        phone: normalized,
        purpose: resolvedPurpose,
        status: PhoneVerificationStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) {
      return { ok: false, error: 'code_not_found' };
    }

    // 过期
    if (latest.expiresAt.getTime() < now.getTime()) {
      await this.prisma.phoneVerification.update({
        where: { id: latest.id },
        data: {
          status: PhoneVerificationStatus.CONSUMED,
          consumedAt: now,
        },
      });
      return { ok: false, error: 'code_expired' };
    }

    // 不匹配
    if (!this.verifyCodeHash(codeTrimmed, latest.codeHash)) {
      await this.prisma.phoneVerification.update({
        where: { id: latest.id },
        data: {
          attempts: latest.attempts + 1,
          lastAttemptAt: now,
        },
      });
      return { ok: false, error: 'code_invalid' };
    }

    // ✅ 验证成功：标记为 VERIFIED
    const verificationToken = this.generateVerificationToken();

    await this.prisma.phoneVerification.update({
      where: { id: latest.id },
      data: {
        status: PhoneVerificationStatus.VERIFIED,
        verifiedAt: now,
        token: verificationToken,
      },
    });

    return {
      ok: true,
      verificationToken,
    };
  }
}
