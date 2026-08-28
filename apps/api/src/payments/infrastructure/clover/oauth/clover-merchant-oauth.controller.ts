import { Controller, Get, Query, Redirect } from '@nestjs/common';

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
  @Redirect(undefined, 302)
  async start(
    @Query() query: CloverOAuthLaunchInput,
  ): Promise<{ url: string; statusCode: number }> {
    try {
      return { url: await this.authorization.start(query), statusCode: 302 };
    } catch (error) {
      return {
        url: this.resultUrl('failure', this.publicErrorCode(error)),
        statusCode: 303,
      };
    }
  }

  @Get('callback')
  @Redirect(undefined, 302)
  async callback(
    @Query() query: CloverOAuthCallbackInput,
  ): Promise<{ url: string; statusCode: number }> {
    try {
      const result = await this.authorization.complete(query);
      return {
        url: this.resultUrl('success', undefined, {
          merchant: result.merchantName ?? result.merchantId,
          merchantId: result.merchantId,
          storeStableId: result.storeStableId ?? undefined,
          binding: result.status,
        }),
        statusCode: 303,
      };
    } catch (error) {
      return {
        url: this.resultUrl('failure', this.publicErrorCode(error)),
        statusCode: 303,
      };
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
