import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class MfaGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      session?: { mfaVerifiedAt?: Date | null };
    }>();

    const mfaVerifiedAt = request.session?.mfaVerifiedAt ?? null;
    if (!mfaVerifiedAt) {
      throw new UnauthorizedException('MFA required');
    }

    return true;
  }
}
