// apps/api/src/auth/admin-mfa.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class AdminMfaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<
        Request & { session?: { mfaVerifiedAt?: Date | string | null } }
      >();
    const mfaVerifiedAt = request.session?.mfaVerifiedAt;

    // 1. 基础检查：如果没有会话，拦截
    if (!request.session) {
      throw new UnauthorizedException('Session required');
    }

    // 读取类接口不触发后台二次验证，避免浏览/列表等 GET 被强制拦截。
    if (request.method.toUpperCase() === 'GET') {
      return true;
    }

    // 2. 核心检查：POS 登录时，auth.service.ts 已经自动写入了 mfaVerifiedAt
    // 所以只要这个字段有值，就代表“已通过验证” (不论是人工输入的 OTP 还是 POS 自动豁免)
    if (mfaVerifiedAt) {
      return true; // ✅ 放行
    }

    // 3. 非 GET 的关键操作如果 mfaVerifiedAt 为空，则要求先完成 OTP 验证
    throw new UnauthorizedException('Admin MFA required');
  }
}
