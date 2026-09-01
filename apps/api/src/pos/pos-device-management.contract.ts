export const POS_DEVICE_MANAGEMENT = Symbol('POS_DEVICE_MANAGEMENT');
export const POS_DEVICE_ADMIN_COMPATIBILITY = Symbol(
  'POS_DEVICE_ADMIN_COMPATIBILITY',
);

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

/**
 * Temporary adapter for browser bundles that may still hold legacy DB UUIDs or
 * omit an explicit store identity. Canonical Admin code must not use this port.
 * @compat pos-device.admin-db-id.v1
 */
export interface PosDeviceAdminCompatibilityPort {
  listDevices(): Promise<PosDeviceManagementSnapshot[]>;
  resolveStoreStableId(legacyStoreDbId?: string): Promise<string>;
  resolveDeviceStableId(legacyDeviceDbId: string): Promise<string>;
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
