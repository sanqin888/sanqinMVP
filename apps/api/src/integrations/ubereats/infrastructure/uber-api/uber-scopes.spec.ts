import { UberApiConfigService } from './uber-api-config.service';
import {
  UBER_CLIENT_CREDENTIAL_SCOPES,
  UBER_MERCHANT_AUTHORIZATION_SCOPES,
  UBER_REQUIRED_CLIENT_CREDENTIAL_SCOPES,
} from './uber-scopes';

describe('Uber OAuth scope registry', () => {
  it('keeps client_credentials and authorization_code scopes disjoint', () => {
    const clientScopes = new Set<string>(
      Object.values(UBER_CLIENT_CREDENTIAL_SCOPES),
    );
    const merchantScopes = Object.values(UBER_MERCHANT_AUTHORIZATION_SCOPES);

    expect(merchantScopes.filter((scope) => clientScopes.has(scope))).toEqual(
      [],
    );
    expect(UBER_REQUIRED_CLIENT_CREDENTIAL_SCOPES).toEqual([
      'eats.store',
      'eats.order',
      'eats.store.status.write',
    ]);
  });

  it('defaults deployment expectations to the scopes SanQ currently requires', () => {
    const config = new UberApiConfigService({});

    expect(config.expectedAppScopes).toBe(
      'eats.store eats.order eats.store.status.write',
    );
    expect(config.merchantAuthorizationScopes).toBe('eats.pos_provisioning');
  });

  it('allows known extra scopes without making them runtime requirements', () => {
    const config = new UberApiConfigService({
      UBER_EATS_APP_SCOPES:
        'eats.store eats.order eats.store.status.write eats.report',
      UBER_EATS_USER_AUTH_SCOPES:
        'eats.pos_provisioning offline_access eats.pos_provisioning',
    });

    expect(config.expectedAppScopes).toBe(
      'eats.store eats.order eats.store.status.write eats.report',
    );
    expect(config.merchantAuthorizationScopes).toBe(
      'eats.pos_provisioning offline_access',
    );
  });

  it('rejects a deployment declaration missing a required app scope', () => {
    expect(
      () =>
        new UberApiConfigService({
          UBER_EATS_APP_SCOPES: 'eats.store eats.order',
        }),
    ).toThrow('eats.store.status.write');
  });

  it('rejects scopes from the wrong OAuth grant type', () => {
    expect(
      () =>
        new UberApiConfigService({
          UBER_EATS_APP_SCOPES:
            'eats.store eats.order eats.store.status.write eats.pos_provisioning',
        }),
    ).toThrow('不属于该 OAuth grant type');

    expect(
      () =>
        new UberApiConfigService({
          UBER_EATS_USER_AUTH_SCOPES: 'eats.pos_provisioning eats.store',
        }),
    ).toThrow('不属于该 OAuth grant type');
  });
});
