import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { CloverProviderConfig } from '../clover-provider.config';
import {
  CloverMerchantAuthorizationError,
  CloverMerchantAuthorizationService,
} from './clover-merchant-authorization.service';
import { CloverMerchantOAuthController } from './clover-merchant-oauth.controller';

const config = {
  oauthCallbackUrl: 'https://sanq.ca/clover/oauth/callback',
} as unknown as CloverProviderConfig;

const start = jest.fn<CloverMerchantAuthorizationService['start']>();
const complete = jest.fn<CloverMerchantAuthorizationService['complete']>();

const authorization = { start, complete };

describe('CloverMerchantOAuthController HTTP redirect contract', () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CloverMerchantOAuthController],
      providers: [
        {
          provide: CloverMerchantAuthorizationService,
          useValue: authorization,
        },
        {
          provide: CloverProviderConfig,
          useValue: config,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    httpServer = app.getHttpServer() as unknown as Server;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns an actual 302 Location redirect to Clover authorize', async () => {
    start.mockResolvedValue(
      'https://www.clover.com/oauth/v2/authorize?state=opaque',
    );

    const response = await request(httpServer)
      .get('/api/v1/payments/clover/oauth/start')
      .query({ merchant_id: 'MERCHANT123' })
      .redirects(0);

    expect(response.status).toBe(302);
    expect(response.get('location')).toBe(
      'https://www.clover.com/oauth/v2/authorize?state=opaque',
    );
  });

  it('returns an actual 303 Location redirect on start failure', async () => {
    start.mockRejectedValue(
      new CloverMerchantAuthorizationError('INVALID_LAUNCH'),
    );

    const response = await request(httpServer)
      .get('/api/v1/payments/clover/oauth/start')
      .query({ merchant_id: 'MERCHANT123' })
      .redirects(0);

    expect(response.status).toBe(303);
    expect(response.get('location')).toBe(
      'https://sanq.ca/clover/oauth/result?status=failure&reason=INVALID_LAUNCH',
    );
  });

  it('redirects a successful callback to the non-sensitive browser result page', async () => {
    complete.mockResolvedValue({
      merchantId: 'MERCHANT123',
      merchantName: 'SanQ Roujiamo',
      storeStableId: '4750_Yonge_Street',
      status: 'ACTIVE',
    });

    const response = await request(httpServer)
      .get('/api/v1/payments/clover/oauth/callback')
      .query({
        code: 'authorization-code',
        state: 'opaque-state',
        merchant_id: 'MERCHANT123',
      })
      .redirects(0);

    expect(response.status).toBe(303);
    const location = response.get('location');
    expect(location).toBeDefined();
    const url = new URL(location ?? 'https://invalid.local');
    expect(url.origin + url.pathname).toBe(
      'https://sanq.ca/clover/oauth/result',
    );
    expect(url.searchParams.get('status')).toBe('success');
    expect(url.searchParams.get('merchant')).toBe('SanQ Roujiamo');
    expect(url.searchParams.get('storeStableId')).toBe('4750_Yonge_Street');
    expect(url.toString()).not.toContain('authorization-code');
    expect(url.toString()).not.toContain('opaque-state');
  });

  it('redirects callback failures with only a safe public reason code', async () => {
    complete.mockRejectedValue(
      new CloverMerchantAuthorizationError('INVALID_STATE'),
    );

    const response = await request(httpServer)
      .get('/api/v1/payments/clover/oauth/callback')
      .query({
        code: 'sensitive-code',
        state: 'sensitive-state',
        merchant_id: 'MERCHANT123',
      })
      .redirects(0);

    expect(response.status).toBe(303);
    const location = response.get('location');
    expect(location).toBe(
      'https://sanq.ca/clover/oauth/result?status=failure&reason=INVALID_STATE',
    );
    expect(location).not.toContain('sensitive-code');
    expect(location).not.toContain('sensitive-state');
  });
});
