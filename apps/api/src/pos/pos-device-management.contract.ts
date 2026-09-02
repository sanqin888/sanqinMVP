export const POS_DEVICE_MANAGEMENT = Symbol('POS_DEVICE_MANAGEMENT');
export const POS_DEVICE_CREDENTIAL_VERIFIER = Symbol(
  'POS_DEVICE_CREDENTIAL_VERIFIER',
);

export type PosDeviceCredentials = {
  deviceStableId: string;
  deviceKey: string;
};

export type AuthenticatedPosIdentity = Readonly<{
  deviceStableId: string;
  storeStableId: string;
  name: string | null;
}>;

export interface PosDeviceCredentialVerifierPort {
  verifyCredentials(
    credentials: PosDeviceCredentials,
  ): Promise<AuthenticatedPosIdentity | null>;
}

export type PosDeviceManagementStatus = 'ACTIVE' | 'DISABLED';

export type PosDeviceManagementSnapshot = {
  deviceStableId: string;
  storeStableId: string;
  name: string | null;
  status: PosDeviceManagementStatus;
  enrolledAt: Date;
  lastSeenAt: Date | null;
};

export type PosDeviceEnrollmentResult = PosDeviceManagementSnapshot & {
  enrollmentCode: string;
};

export interface PosDeviceManagementPort {
  listDevicesByStore(
    storeStableId: string,
  ): Promise<PosDeviceManagementSnapshot[]>;
  createDevice(input: {
    storeStableId: string;
    name: string;
  }): Promise<PosDeviceEnrollmentResult>;
  resetEnrollmentCode(
    deviceStableId: string,
  ): Promise<PosDeviceEnrollmentResult>;
  updateDeviceStatus(
    deviceStableId: string,
    status: PosDeviceManagementStatus,
  ): Promise<PosDeviceManagementSnapshot>;
  deleteDevice(deviceStableId: string): Promise<void>;
}

export class PosDeviceStoreUnavailableError extends Error {
  constructor(storeStableId: string) {
    super(`Store ${storeStableId} does not reference an active store`);
    this.name = 'PosDeviceStoreUnavailableError';
  }
}

export class PosDeviceNotFoundError extends Error {
  constructor(deviceIdentifier: string) {
    super(`POS device ${deviceIdentifier} was not found`);
    this.name = 'PosDeviceNotFoundError';
  }
}
