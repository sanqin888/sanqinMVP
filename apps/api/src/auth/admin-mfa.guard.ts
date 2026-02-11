// apps/api/src/auth/admin-mfa.guard.ts
import { 
  CanActivate, 
  ExecutionContext, 
  Injectable, 
  UnauthorizedException 
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class AdminMfaGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const session = request.session;

    // 1. 基础检查：如果没有会话，拦截
    if (!session) {
      throw new UnauthorizedException('Session required');
    }

    // 2. 核心检查：POS 登录时，auth.service.ts 已经自动写入了 mfaVerifiedAt
    // 所以只要这个字段有值，就代表“已通过验证” (不论是人工输入的 OTP 还是 POS 自动豁免)
    if (session.mfaVerifiedAt) {
      return true; // ✅ 放行
    }

    // 3. 如果到了这里 mfaVerifiedAt 还是空的，说明是普通网页登录且未验证 OTP
    throw new UnauthorizedException('Admin MFA required');
  }
}