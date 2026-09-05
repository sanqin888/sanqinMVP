export const ACCOUNT_SECURITY_ADMINISTRATION = Symbol(
  'ACCOUNT_SECURITY_ADMINISTRATION',
);

export type ManagedAccountStatus = 'ACTIVE' | 'DISABLED';

export type AccountSessionDto = {
  sessionId: string;
  createdAt: string;
  expiresAt: string;
  mfaVerifiedAt: string | null;
  deviceInfo: string | null;
  loginLocation: string | null;
  isCurrent: boolean;
};

export type AccountTrustedDeviceDto = {
  /** Compatibility alias for cached Web/PWA bundles. Carries the stable ID, never the DB UUID. */
  id: string;
  trustedDeviceStableId: string;
  label: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
};

export type AccountDeviceManagementDto = {
  sessions: AccountSessionDto[];
  trustedDevices: AccountTrustedDeviceDto[];
};

export type AccountSecurityAdministrationErrorCode =
  | 'USER_NOT_FOUND'
  | 'SESSION_NOT_FOUND';

export class AccountSecurityAdministrationError extends Error {
  constructor(
    readonly code: AccountSecurityAdministrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = AccountSecurityAdministrationError.name;
  }
}

export interface AccountSecurityAdministrationPort {
  getDeviceManagement(
    userStableId: string,
    currentSessionId?: string,
  ): Promise<AccountDeviceManagementDto>;
  revokeSession(userStableId: string, sessionId: string): Promise<void>;
  revokeTrustedDevice(
    userStableId: string,
    trustedDeviceStableId: string,
  ): Promise<void>;
  getSessionDeviceLabel(
    userStableId: string,
    sessionId: string,
  ): Promise<{ label?: string }>;
  setAccountStatus(
    userStableId: string,
    disabled: boolean,
  ): Promise<{ userStableId: string; status: ManagedAccountStatus }>;
}
