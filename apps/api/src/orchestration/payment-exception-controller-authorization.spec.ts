import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AdminMfaGuard } from '../auth/admin-mfa.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { PosDeviceGuard } from '../pos/public-api';
import {
  AdminPaymentExceptionController,
  PosPaymentExceptionController,
} from './pos-card-payment.controller';

describe('PEM authentication and workflow authorization boundary', () => {
  it('allows authenticated enrolled POS STAFF to request and execute only sandbox-eligible cases', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, PosPaymentExceptionController),
    ).toEqual(['STAFF', 'ADMIN']);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PosPaymentExceptionController),
    ).toEqual(
      expect.arrayContaining([SessionAuthGuard, RolesGuard, PosDeviceGuard]),
    );
  });

  it('requires ADMIN identity, authenticated session and MFA for approval', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, AdminPaymentExceptionController),
    ).toEqual(['ADMIN']);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminPaymentExceptionController),
    ).toEqual(
      expect.arrayContaining([SessionAuthGuard, AdminMfaGuard, RolesGuard]),
    );
  });
});
