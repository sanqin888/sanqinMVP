// apps/api/src/auth/auth.service.ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalizePhone(phone: string): string {
    // 简单清洗：去掉空格和连字符
    return phone.replace(/[\s-]+/g, '');
  }

  private generateCode(): string {
    // 6 位数字验证码
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * 申请发送手机验证码
   * - 同一 (phone, purpose) 下旧验证码全部作废
   * - 新插入一条可用验证码
   */
  async requestPhoneCode(params: { phone: string; purpose?: string }) {
    const { phone, purpose = 'checkout' } = params;
    const normalized = this.normalizePhone(phone);

    if (!normalized || normalized.length < 6) {
      throw new BadRequestException('invalid phone');
    }

    const now = new Date();

    // 频率限制：同一手机号 + 用途，1 分钟最多一次、1 小时最多 5 次
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recent = await this.prisma.phoneVerification.findFirst({
      where: {
        phone: normalized,
        purpose,
        createdAt: { gt: oneMinuteAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recent) {
      throw new BadRequestException('too many requests, please try later');
    }

    const lastHourCount = await this.prisma.phoneVerification.count({
      where: {
        phone: normalized,
        purpose,
        createdAt: { gt: oneHourAgo },
      },
    });

    if (lastHourCount >= 5) {
      throw new BadRequestException('too many requests in an hour');
    }

    const code = this.generateCode();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 分钟有效

    await this.prisma.$transaction(async (tx) => {
      // 1️⃣ 先把同一 (phone, purpose) 下所有未使用的旧验证码标记为 used=true
      await tx.phoneVerification.updateMany({
        where: {
          phone: normalized,
          purpose,
          used: false,
        },
        data: {
          used: true,
        },
      });

      // 2️⃣ 再插入一条新的验证码记录
      await tx.phoneVerification.create({
        data: {
          phone: normalized,
          code,
          purpose,
          used: false,
          expiresAt,
        },
      });
    });

    // 目前用 log 的方式“发送”，方便本地调试
    this.logger.log(
      `Phone OTP for ${normalized} (purpose=${purpose}): ${code}`,
    );

    return { success: true };
  }

  /**
   * 校验验证码：
   * - 只看「未使用 + 未过期」的最新一条
   * - 验证码正确 => 标记 used=true（只能用一次）
   * - 如果带 userId，则顺便把手机号绑定到 User 上
   */
  async verifyPhoneCode(params: {
    phone: string;
    code: string;
    purpose?: string;
    userId?: string;
  }) {
    const { phone, code, purpose = 'checkout', userId } = params;
    const normalized = this.normalizePhone(phone);

    if (!normalized || !code) {
      throw new BadRequestException('phone and code are required');
    }

    const now = new Date();

    // 1️⃣ 找未使用 + 未过期的最新一条记录
    const record = await this.prisma.phoneVerification.findFirst({
      where: {
        phone: normalized,
        purpose,
        used: false,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record || record.code !== code) {
      // 统一提示，避免暴露太多信息
      throw new BadRequestException('verification code is invalid or expired');
    }

    // 2️⃣ 验证成功：标记为已使用（只能用一次）
    await this.prisma.phoneVerification.update({
      where: { id: record.id },
      data: { used: true },
    });

    // 3️⃣ 如果是已登录会员，可以顺手把手机号写到 User 表
    if (userId) {
      await this.attachPhoneToUser({ userId, phone: normalized });
    }

    return { success: true };
  }

  private async attachPhoneToUser(params: { userId: string; phone: string }) {
    const { userId, phone } = params;

    // 确保同一手机号不会被两个用户共用
    const existing = await this.prisma.user.findFirst({
      where: {
        phone,
        id: { not: userId },
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('phone already used by another member');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone,
        phoneVerifiedAt: new Date(),
      },
    });
  }
}
