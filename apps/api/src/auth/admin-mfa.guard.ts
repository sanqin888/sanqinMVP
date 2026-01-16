import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { User } from '@prisma/client';

type ReqWithAuth = {
  user?: User;
  session?: { mfaVerifiedAt?: Date | null };
};

@Injectable()
export class AdminMfaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ReqWithAuth>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Missing session');
    }

    const isAdminRole = user.role === 'ADMIN' || user.role === 'STAFF';
    if (!isAdminRole) {
      return true;
    }

    const mfaVerifiedAt = request.session?.mfaVerifiedAt ?? null;
    if (!mfaVerifiedAt) {
      throw new UnauthorizedException('MFA required');
    }

    return true;
  }
}
