import {
  BadRequestException,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { OauthStateService } from './oauth-state.service';

@Injectable()
export class GoogleStartGuard extends AuthGuard('google') {
  constructor(private readonly state: OauthStateService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const query = req.query ?? {};

    const callbackParam = query['callbackUrl'];
    const phoneParam = query['phone'];
    const pvParam = query['pv'];
    const callbackUrl = typeof callbackParam === 'string' ? callbackParam : '/';
    const phone = typeof phoneParam === 'string' ? phoneParam.trim() : '';
    const pv = typeof pvParam === 'string' ? pvParam.trim() : '';

    if (!phone || !pv) {
      throw new BadRequestException('phone and pv are required');
    }

    return {
      prompt: 'select_account',
      state: this.state.sign({ callbackUrl, phone, pv }),
    };
  }
}
