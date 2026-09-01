import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Prisma } from '@prisma/client';
import { withPosConnectivityHeartbeatEnabled } from '../common/pos-connectivity';
import {
  resolveConfiguredStoreStableId,
  STORE_DIRECTORY_READER,
  STORE_LEGACY_DB_ID_RESOLVER,
  type StoreDirectoryReaderPort,
  type StoreLegacyDbIdResolverPort,
} from '../store/public-api';
import {
  type AuthenticatedPosIdentity,
  type PosDeviceCredentialVerifierPort,
  type PosDeviceCredentials,
} from './pos-device-auth.contract';
import {
  type PosDeviceAdminCompatibilityPort,
  type PosDeviceEnrollmentResult,
  type PosDeviceManagementPort,
  type PosDeviceManagementSnapshot,
  type PosDeviceManagementStatus,
  PosDeviceNotFoundError,
  PosDeviceStoreUnavailableError,
} from './pos-device-management.contract';

type PosDeviceMetaInput = Prisma.InputJsonValue;

type ManagedDeviceRecord = {
  deviceStableId: string;
  name: string | null;
  status: PosDeviceManagementStatus;
  enrolledAt: Date;
  lastSeenAt: Date | null;
  store: { storeStableId: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function toJsonObject(value: Record<string, unknown>): Prisma.JsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.JsonObject;
}

@Injectable()
export class PosDeviceService
  implements
    PosDeviceManagementPort,
    PosDeviceAdminCompatibilityPort,
    PosDeviceCredentialVerifierPort
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORE_DIRECTORY_READER)
    private readonly storeDirectoryReader: StoreDirectoryReaderPort,
    @Inject(STORE_LEGACY_DB_ID_RESOLVER)
    private readonly storeLegacyDbIdResolver: StoreLegacyDbIdResolverPort,
  ) {}

  private hashDeviceKey(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private verifyDeviceKey(value: string, hash: string): boolean {
    const computed = this.hashDeviceKey(value);
    if (computed.length !== hash.length) return false;
    return timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(computed, 'hex'),
    );
  }

  private generateEnrollmentCode(): string {
    return randomBytes(4).toString('hex').toUpperCase();
  }

  private buildMeta(input: unknown, userAgent?: string): PosDeviceMetaInput {
    const meta = isRecord(input) ? { ...input } : {};
    if (userAgent && !('userAgent' in meta)) {
      meta.userAgent = userAgent;
    }
    return toJsonObject(meta);
  }

  private toManagementSnapshot(
    device: ManagedDeviceRecord,
  ): PosDeviceManagementSnapshot {
    return {
      deviceStableId: device.deviceStableId,
      storeStableId: device.store.storeStableId,
      name: device.name,
      status: device.status,
      enrolledAt: device.enrolledAt,
      lastSeenAt: device.lastSeenAt,
    };
  }

  private async requireManagedDevice(
    deviceStableId: string,
  ): Promise<ManagedDeviceRecord> {
    const device = await this.prisma.posDevice.findUnique({
      where: { deviceStableId },
      select: {
        deviceStableId: true,
        name: true,
        status: true,
        enrolledAt: true,
        lastSeenAt: true,
        store: { select: { storeStableId: true } },
      },
    });
    if (!device) {
      throw new PosDeviceNotFoundError(deviceStableId);
    }
    return device;
  }

  async claimDevice(params: {
    enrollmentCode: string;
    meta?: unknown;
    userAgent?: string;
  }) {
    const enrollmentCode = params.enrollmentCode.trim();
    if (!enrollmentCode) {
      throw new UnauthorizedException('Enrollment code required');
    }

    const enrollmentHash = this.hashDeviceKey(enrollmentCode);
    const device = await this.prisma.posDevice.findFirst({
      where: { status: 'ACTIVE', enrollmentKeyHash: enrollmentHash },
    });

    if (!device) {
      throw new UnauthorizedException('Invalid enrollment code');
    }

    const deviceKey = randomBytes(32).toString('hex');
    const deviceKeyHash = this.hashDeviceKey(deviceKey);
    const meta = this.buildMeta(params.meta, params.userAgent);

    const newEnrollmentKeyHash = this.hashDeviceKey(
      randomBytes(16).toString('hex'),
    );

    const updated = await this.prisma.posDevice.update({
      where: { id: device.id },
      data: {
        deviceKeyHash,
        meta,
        lastSeenAt: new Date(),
        enrollmentKeyHash: newEnrollmentKeyHash,
      },
      select: {
        deviceStableId: true,
        name: true,
        status: true,
        meta: true,
        enrolledAt: true,
        lastSeenAt: true,
      },
    });

    return { device: updated, deviceKey };
  }

  async verifyCredentials(
    params: PosDeviceCredentials,
  ): Promise<AuthenticatedPosIdentity | null> {
    const device = await this.prisma.posDevice.findUnique({
      where: { deviceStableId: params.deviceStableId },
      select: {
        id: true,
        deviceKeyHash: true,
        status: true,
        deviceStableId: true,
        name: true,
        store: { select: { storeStableId: true } },
      },
    });

    if (!device || device.status !== 'ACTIVE') {
      return null;
    }

    if (!this.verifyDeviceKey(params.deviceKey, device.deviceKeyHash)) {
      return null;
    }

    await this.prisma.posDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });

    return {
      deviceStableId: device.deviceStableId,
      storeStableId: device.store.storeStableId,
      name: device.name,
    };
  }

  async recordConnectivityHeartbeat(deviceStableId: string): Promise<void> {
    const device = await this.prisma.posDevice.findUnique({
      where: { deviceStableId },
      select: { id: true, meta: true },
    });
    if (!device) return;

    const nextMeta = withPosConnectivityHeartbeatEnabled(device.meta);
    const current = isRecord(device.meta) ? device.meta : null;
    if (current?.connectivityHeartbeatV1 === true) return;

    await this.prisma.posDevice.update({
      where: { id: device.id },
      data: { meta: toJsonObject(nextMeta) },
    });
  }

  // @compat pos-device.admin-db-id.v1
  async listDevices(): Promise<PosDeviceManagementSnapshot[]> {
    const devices = await this.prisma.posDevice.findMany({
      orderBy: { enrolledAt: 'desc' },
      select: {
        deviceStableId: true,
        name: true,
        status: true,
        enrolledAt: true,
        lastSeenAt: true,
        store: { select: { storeStableId: true } },
      },
    });
    return devices.map((device) => this.toManagementSnapshot(device));
  }

  async listDevicesByStore(
    storeStableId: string,
  ): Promise<PosDeviceManagementSnapshot[]> {
    const devices = await this.prisma.posDevice.findMany({
      where: { store: { storeStableId } },
      orderBy: { enrolledAt: 'desc' },
      select: {
        deviceStableId: true,
        name: true,
        status: true,
        enrolledAt: true,
        lastSeenAt: true,
        store: { select: { storeStableId: true } },
      },
    });
    return devices.map((device) => this.toManagementSnapshot(device));
  }

  async createDevice(input: {
    storeStableId: string;
    name: string;
  }): Promise<PosDeviceEnrollmentResult> {
    const store = (await this.storeDirectoryReader.listStores()).find(
      (candidate) => candidate.storeStableId === input.storeStableId,
    );
    if (!store?.isActive) {
      throw new PosDeviceStoreUnavailableError(input.storeStableId);
    }

    const enrollmentCode = this.generateEnrollmentCode();
    const enrollmentKeyHash = this.hashDeviceKey(enrollmentCode);
    const initialDeviceKeyHash = this.hashDeviceKey(
      `PENDING_CLAIM_${randomBytes(8).toString('hex')}`,
    );

    const device = await this.prisma.posDevice.create({
      data: {
        name: input.name,
        store: { connect: { storeStableId: input.storeStableId } },
        enrollmentKeyHash,
        deviceKeyHash: initialDeviceKeyHash,
        status: 'ACTIVE',
      },
      select: {
        deviceStableId: true,
        name: true,
        status: true,
        enrolledAt: true,
        lastSeenAt: true,
        store: { select: { storeStableId: true } },
      },
    });

    return {
      ...this.toManagementSnapshot(device),
      enrollmentCode,
    };
  }

  async resetEnrollmentCode(
    deviceStableId: string,
  ): Promise<PosDeviceEnrollmentResult> {
    await this.requireManagedDevice(deviceStableId);
    const enrollmentCode = this.generateEnrollmentCode();
    const enrollmentKeyHash = this.hashDeviceKey(enrollmentCode);

    const device = await this.prisma.posDevice.update({
      where: { deviceStableId },
      data: {
        enrollmentKeyHash,
        status: 'ACTIVE',
      },
      select: {
        deviceStableId: true,
        name: true,
        status: true,
        enrolledAt: true,
        lastSeenAt: true,
        store: { select: { storeStableId: true } },
      },
    });

    return {
      ...this.toManagementSnapshot(device),
      enrollmentCode,
    };
  }

  async updateDeviceStatus(
    deviceStableId: string,
    status: PosDeviceManagementStatus,
  ): Promise<PosDeviceManagementSnapshot> {
    await this.requireManagedDevice(deviceStableId);
    const device = await this.prisma.posDevice.update({
      where: { deviceStableId },
      data: { status },
      select: {
        deviceStableId: true,
        name: true,
        status: true,
        enrolledAt: true,
        lastSeenAt: true,
        store: { select: { storeStableId: true } },
      },
    });
    return this.toManagementSnapshot(device);
  }

  async deleteDevice(deviceStableId: string): Promise<void> {
    await this.requireManagedDevice(deviceStableId);
    await this.prisma.posDevice.delete({ where: { deviceStableId } });
  }

  // @compat brand-store.default-store-identity.v1
  // @compat pos-device.admin-db-id.v1
  async resolveStoreStableId(legacyStoreDbId?: string): Promise<string> {
    if (!legacyStoreDbId) {
      return resolveConfiguredStoreStableId();
    }
    const storeStableId =
      await this.storeLegacyDbIdResolver.resolveStoreStableIdByDbId(
        legacyStoreDbId,
      );
    if (!storeStableId) {
      throw new PosDeviceStoreUnavailableError(legacyStoreDbId);
    }
    return storeStableId;
  }

  // @compat pos-device.admin-db-id.v1
  async resolveDeviceStableId(legacyDeviceDbId: string): Promise<string> {
    const device = await this.prisma.posDevice.findUnique({
      where: { id: legacyDeviceDbId },
      select: { deviceStableId: true },
    });
    if (!device) {
      throw new PosDeviceNotFoundError(legacyDeviceDbId);
    }
    return device.deviceStableId;
  }
}
