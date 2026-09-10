import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Prisma } from '@prisma/client';
import {
  DEFAULT_POS_CONNECTIVITY_OFFLINE_AFTER_MS,
  isPosConnectivityHeartbeatEnabled,
  readPositiveDurationMs,
  withPosConnectivityHeartbeatEnabled,
} from './pos-connectivity';
import {
  STORE_DIRECTORY_READER,
  type StoreDirectoryReaderPort,
} from '../store/public-api';
import {
  type AuthenticatedPosIdentity,
  type PosDeviceCredentialVerifierPort,
  type PosDeviceCredentials,
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
  implements PosDeviceManagementPort, PosDeviceCredentialVerifierPort
{
  private readonly logger = new Logger(PosDeviceService.name);
  private readonly connectivityOfflineAfterMs = readPositiveDurationMs(
    process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS,
    DEFAULT_POS_CONNECTIVITY_OFFLINE_AFTER_MS,
  );

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORE_DIRECTORY_READER)
    private readonly storeDirectoryReader: StoreDirectoryReaderPort,
  ) {}

  private connectivityValidUntil(lastHeartbeatAt: Date): Date {
    return new Date(
      lastHeartbeatAt.getTime() + this.connectivityOfflineAfterMs,
    );
  }

  private async writeConnectivityReadModelForActivity(
    storeStableId: string,
    lastHeartbeatAt: Date,
  ): Promise<void> {
    const validUntil = this.connectivityValidUntil(lastHeartbeatAt);
    const data = {
      hasHeartbeatCapableActiveDevice: true,
      lastHeartbeatAt,
      validUntil,
    };
    const advanceExisting = () =>
      this.prisma.posConnectivityReadModel.updateMany({
        where: {
          storeStableId,
          OR: [
            { lastHeartbeatAt: null },
            { lastHeartbeatAt: { lt: lastHeartbeatAt } },
          ],
        },
        data,
      });

    const advanced = await advanceExisting();
    if (advanced.count > 0) return;

    const created = await this.prisma.posConnectivityReadModel.createMany({
      data: [{ storeStableId, ...data }],
      skipDuplicates: true,
    });
    if (created.count > 0) return;

    // Another request may have created the row after our first update attempt.
    // Retry the monotonic advance once; an older activity can never overwrite
    // the timestamp/lease already written by a newer request.
    await advanceExisting();
  }

  private async readConnectivityProjectionSource(storeStableId: string) {
    const devices = await this.prisma.posDevice.findMany({
      where: { status: 'ACTIVE', store: { storeStableId } },
      select: { lastSeenAt: true, meta: true },
    });
    const heartbeatDevices = devices.filter((device) =>
      isPosConnectivityHeartbeatEnabled(device.meta),
    );
    const lastHeartbeatAt = heartbeatDevices.reduce<Date | null>(
      (latest, device) => {
        if (!device.lastSeenAt) return latest;
        return !latest || device.lastSeenAt > latest
          ? device.lastSeenAt
          : latest;
      },
      null,
    );
    return {
      hasHeartbeatCapableActiveDevice: heartbeatDevices.length > 0,
      lastHeartbeatAt,
    };
  }

  private async refreshConnectivityReadModelForStore(
    storeStableId: string,
  ): Promise<void> {
    const source = await this.readConnectivityProjectionSource(storeStableId);
    await this.prisma.posConnectivityReadModel.upsert({
      where: { storeStableId },
      create: {
        storeStableId,
        ...source,
        validUntil: source.lastHeartbeatAt
          ? this.connectivityValidUntil(source.lastHeartbeatAt)
          : null,
      },
      update: {
        ...source,
        validUntil: source.lastHeartbeatAt
          ? this.connectivityValidUntil(source.lastHeartbeatAt)
          : null,
      },
    });
  }

  private async writeConnectivityReadModelForActivitySafely(
    storeStableId: string,
    lastHeartbeatAt: Date,
  ): Promise<void> {
    try {
      await this.writeConnectivityReadModelForActivity(
        storeStableId,
        lastHeartbeatAt,
      );
    } catch (error) {
      this.logger.warn({
        event: 'pos_connectivity_read_model_write_failed',
        storeStableId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async refreshConnectivityReadModelForStoreSafely(
    storeStableId: string,
  ): Promise<void> {
    try {
      await this.refreshConnectivityReadModelForStore(storeStableId);
    } catch (error) {
      this.logger.warn({
        event: 'pos_connectivity_read_model_refresh_failed',
        storeStableId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async repairConnectivityReadModelForStore(
    storeStableId: string,
  ): Promise<void> {
    try {
      const source = await this.readConnectivityProjectionSource(storeStableId);
      if (!source.hasHeartbeatCapableActiveDevice) {
        await this.prisma.posConnectivityReadModel.upsert({
          where: { storeStableId },
          create: {
            storeStableId,
            hasHeartbeatCapableActiveDevice: false,
            lastHeartbeatAt: null,
            validUntil: null,
          },
          update: {
            hasHeartbeatCapableActiveDevice: false,
            lastHeartbeatAt: null,
            validUntil: null,
          },
        });
        return;
      }

      if (source.lastHeartbeatAt) {
        await this.writeConnectivityReadModelForActivity(
          storeStableId,
          source.lastHeartbeatAt,
        );
        return;
      }

      const data = {
        hasHeartbeatCapableActiveDevice: true,
        lastHeartbeatAt: null,
        validUntil: null,
      };
      const updated = await this.prisma.posConnectivityReadModel.updateMany({
        where: { storeStableId, lastHeartbeatAt: null },
        data,
      });
      if (updated.count > 0) return;
      await this.prisma.posConnectivityReadModel.createMany({
        data: [{ storeStableId, ...data }],
        skipDuplicates: true,
      });
    } catch (error) {
      this.logger.warn({
        event: 'pos_connectivity_read_model_refresh_failed',
        storeStableId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async repairConnectivityReadModelIfDeviceBecameInactive(
    deviceId: string,
    storeStableId: string,
  ): Promise<boolean> {
    try {
      const current = await this.prisma.posDevice.findUnique({
        where: { id: deviceId },
        select: { status: true },
      });
      if (current?.status === 'ACTIVE') return true;
      await this.refreshConnectivityReadModelForStore(storeStableId);
      return false;
    } catch (error) {
      this.logger.warn({
        event: 'pos_connectivity_read_model_refresh_failed',
        storeStableId,
        error: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
  }

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
        store: { select: { storeStableId: true } },
      },
    });

    await this.refreshConnectivityReadModelForStoreSafely(
      updated.store.storeStableId,
    );
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
        meta: true,
        store: { select: { storeStableId: true } },
      },
    });

    if (!device || device.status !== 'ACTIVE') {
      return null;
    }

    if (!this.verifyDeviceKey(params.deviceKey, device.deviceKeyHash)) {
      return null;
    }

    const lastSeenAt = new Date();
    const activityRecorded = await this.prisma.posDevice.updateMany({
      where: { id: device.id, status: 'ACTIVE' },
      data: { lastSeenAt },
    });
    if (activityRecorded.count === 0) return null;
    if (isPosConnectivityHeartbeatEnabled(device.meta)) {
      await this.writeConnectivityReadModelForActivitySafely(
        device.store.storeStableId,
        lastSeenAt,
      );
      const stillActive =
        await this.repairConnectivityReadModelIfDeviceBecameInactive(
          device.id,
          device.store.storeStableId,
        );
      if (!stillActive) return null;
    }

    return {
      deviceStableId: device.deviceStableId,
      storeStableId: device.store.storeStableId,
      name: device.name,
    };
  }

  async recordConnectivityHeartbeat(deviceStableId: string): Promise<void> {
    const device = await this.prisma.posDevice.findUnique({
      where: { deviceStableId },
      select: {
        id: true,
        meta: true,
        store: { select: { storeStableId: true } },
      },
    });
    if (!device) return;

    const nextMeta = withPosConnectivityHeartbeatEnabled(device.meta);
    const current = isRecord(device.meta) ? device.meta : null;
    if (current?.connectivityHeartbeatV1 === true) return;

    await this.prisma.posDevice.update({
      where: { id: device.id },
      data: { meta: toJsonObject(nextMeta) },
    });
    await this.refreshConnectivityReadModelForStoreSafely(
      device.store.storeStableId,
    );
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

    await this.refreshConnectivityReadModelForStoreSafely(
      device.store.storeStableId,
    );
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
    await this.refreshConnectivityReadModelForStoreSafely(
      device.store.storeStableId,
    );
    return this.toManagementSnapshot(device);
  }

  async deleteDevice(deviceStableId: string): Promise<void> {
    const device = await this.requireManagedDevice(deviceStableId);
    await this.prisma.posDevice.delete({ where: { deviceStableId } });
    await this.refreshConnectivityReadModelForStoreSafely(
      device.store.storeStableId,
    );
  }
}
