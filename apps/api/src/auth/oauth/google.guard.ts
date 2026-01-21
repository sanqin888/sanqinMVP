import { ExecutionContext, Injectable } from '@nestjs/common';
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
    const callbackUrl = typeof callbackParam === 'string' ? callbackParam : '/';
    const languageParam = query['language'];
    const language =
      typeof languageParam === 'string' ? languageParam : undefined;

    return {
      prompt: 'select_account',
      state: this.state.sign({ callbackUrl, language }),
    };
  }
}
