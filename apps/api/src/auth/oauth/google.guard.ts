import { BadRequestException, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OauthStateService } from './oauth-state.service';

@Injectable()
export class GoogleStartGuard extends AuthGuard('google') {
  constructor(private readonly state: OauthStateService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest() as any;

    const callbackUrl = String(req.query?.callbackUrl ?? '/');
    const phone = String(req.query?.phone ?? '').trim();
    const pv = String(req.query?.pv ?? '').trim();

    if (!phone || !pv) {
      throw new BadRequestException('phone and pv are required');
    }

    return {
      prompt: 'select_account',
      state: this.state.sign({ callbackUrl, phone, pv }),
    };
  }
}
