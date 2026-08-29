import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { CloverProviderConfig } from '../clover-provider.config';
import {
  CloverMerchantAuthorizationError,
  CloverMerchantAuthorizationService,
  type CloverOAuthCallbackInput,
  type CloverOAuthFailureCode,
  type CloverOAuthLaunchInput,
} from './clover-merchant-authorization.service';

@Controller('payments/clover/oauth')
export class CloverMerchantOAuthController {
  constructor(
    private readonly authorization: CloverMerchantAuthorizationService,
    private readonly config: CloverProviderConfig,
  ) {}

  @Get('start')
  async start(
    @Query() query: CloverOAuthLaunchInput,
    @Res() response: Response,
  ): Promise<void> {
    try {
      response.redirect(302, await this.authorization.start(query));
    } catch (error) {
      response.redirect(
        303,
        this.resultUrl('failure', this.publicErrorCode(error)),
      );
    }
  }

  @Get('callback')
  async callback(
    @Query() query: CloverOAuthCallbackInput,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const result = await this.authorization.complete(query);
      response.redirect(
        303,
        this.resultUrl('success', undefined, {
          merchant: result.merchantName ?? result.merchantId,
          merchantId: result.merchantId,
          storeStableId: result.storeStableId ?? undefined,
          binding: result.status,
        }),
      );
    } catch (error) {
      response.redirect(
        303,
        this.resultUrl('failure', this.publicErrorCode(error)),
      );
    }
  }

  private publicErrorCode(error: unknown): CloverOAuthFailureCode {
    return error instanceof CloverMerchantAuthorizationError
      ? error.publicCode
      : 'TEMPORARY_FAILURE';
  }

  private resultUrl(
    status: 'success' | 'failure',
    reason?: CloverOAuthFailureCode,
    values: Record<string, string | undefined> = {},
  ): string {
    const origin = this.publicOrigin();
    const url = new URL('/clover/oauth/result', origin);
    url.searchParams.set('status', status);
    if (reason) url.searchParams.set('reason', reason);
    for (const [key, value] of Object.entries(values)) {
      if (value) url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private publicOrigin(): string {
    try {
      return new URL(this.config.oauthCallbackUrl ?? 'https://sanq.ca').origin;
    } catch {
      return 'https://sanq.ca';
    }
  }
}
