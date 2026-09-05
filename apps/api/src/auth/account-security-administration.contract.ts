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
  isCurrent: false;
};

export type AccountSecurityAdministrationErrorCode = 'USER_NOT_FOUND';

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
  listSessions(
    userStableId: string,
  ): Promise<{ sessions: AccountSessionDto[] }>;
  revokeSession(userStableId: string, sessionId: string): Promise<void>;
  setAccountStatus(
    userStableId: string,
    disabled: boolean,
  ): Promise<{ userStableId: string; status: ManagedAccountStatus }>;
}
