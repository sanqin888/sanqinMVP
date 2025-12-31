//Users/apple/sanqinMVP/apps/api/src/auth/mfa.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { TwoFactorMethod } from '@prisma/client';

type ReqWithAuth = {
  user?: {
    twoFactorEnabledAt?: Date | null;
    twoFactorMethod?: TwoFactorMethod;
  };
  session?: { mfaVerifiedAt?: Date | null };
};

@Injectable()
export class MfaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ReqWithAuth>();

    const user = request.user;

    // ✅ 只有用户真的开启了 2FA（SMS）才要求本 session 已完成 MFA
    const twoFactorEnabled =
      !!user?.twoFactorEnabledAt && user?.twoFactorMethod === 'SMS';

    if (!twoFactorEnabled) {
      return true;
    }

    const mfaVerifiedAt = request.session?.mfaVerifiedAt ?? null;
    if (!mfaVerifiedAt) {
      throw new UnauthorizedException('MFA required');
    }

    return true;
  }
}
