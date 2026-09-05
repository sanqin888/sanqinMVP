export const STAFF_ADMINISTRATION = Symbol('STAFF_ADMINISTRATION');

export type StaffAccountRole = 'CUSTOMER' | 'STAFF' | 'ADMIN' | 'ACCOUNTANT';
export type ManagedStaffRole = 'ADMIN' | 'STAFF';
export type ManagedStaffStatus = 'ACTIVE' | 'DISABLED';
export type StaffInviteStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export type StaffUserDto = {
  userStableId: string;
  email: string | null;
  role: ManagedStaffRole;
  status: ManagedStaffStatus;
  createdAt: Date;
  lastLoginAt: Date | null;
  name: string | null;
};

export type StaffInviteDto = {
  inviteStableId: string;
  email: string;
  roleToGrant: StaffAccountRole;
  status: StaffInviteStatus;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  sentCount: number;
  lastSentAt: Date | null;
  invitedByUserStableId: string | null;
};

export type StaffAdministrationErrorCode =
  | 'USER_NOT_FOUND'
  | 'CURRENT_USER_MODIFICATION'
  | 'INVALID_ROLE'
  | 'INVALID_STATUS'
  | 'LAST_ACTIVE_ADMIN'
  | 'MISSING_INVITER';

export class StaffAdministrationError extends Error {
  constructor(
    readonly code: StaffAdministrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = StaffAdministrationError.name;
  }
}

export type UpdateStaffInput = {
  actorUserStableId: string;
  targetUserStableId: string;
  role?: ManagedStaffRole;
  status?: ManagedStaffStatus;
};

export type CreateStaffInviteInput = {
  inviterUserStableId: string;
  email: string;
  role: StaffAccountRole;
  locale?: string;
};

export interface StaffAdministrationPort {
  listStaff(): Promise<{ staff: StaffUserDto[] }>;
  updateStaff(input: UpdateStaffInput): Promise<StaffUserDto>;
  listInvites(): Promise<{ invites: StaffInviteDto[] }>;
  createInvite(
    input: CreateStaffInviteInput,
  ): Promise<{ invite: StaffInviteDto; token: string }>;
  resendInvite(
    inviteStableId: string,
    locale?: string,
  ): Promise<{ invite: StaffInviteDto; token: string }>;
  revokeInvite(inviteStableId: string): Promise<StaffInviteDto>;
}
