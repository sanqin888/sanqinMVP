import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AdminMfaGuard } from '../../../auth/admin-mfa.guard';
import { Roles } from '../../../auth/roles.decorator';
import { RolesGuard } from '../../../auth/roles.guard';
import { SessionAuthGuard } from '../../../auth/session-auth.guard';
import { BrowserWriteCsrfGuard } from './ubereats-csrf.guard';

export const UBER_ADMIN_ACCESS = 'uber_admin_access';

/** One policy definition for every read-only Uber administration endpoint. */
export function UberReadOnlyAdmin() {
  return applyDecorators(
    SetMetadata(UBER_ADMIN_ACCESS, 'read'),
    UseGuards(SessionAuthGuard, RolesGuard),
    Roles('ADMIN'),
  );
}

/** MFA plus same-origin CSRF verification for high-risk browser mutations. */
export function UberMfaAdminWrite() {
  return applyDecorators(
    SetMetadata(UBER_ADMIN_ACCESS, 'mfa-write'),
    UseGuards(
      SessionAuthGuard,
      BrowserWriteCsrfGuard,
      AdminMfaGuard,
      RolesGuard,
    ),
    Roles('ADMIN'),
  );
}

/** Same-origin CSRF verification for ordinary browser mutations. */
export function UberAdminWrite() {
  return applyDecorators(
    SetMetadata(UBER_ADMIN_ACCESS, 'write'),
    UseGuards(SessionAuthGuard, BrowserWriteCsrfGuard, RolesGuard),
    Roles('ADMIN'),
  );
}
