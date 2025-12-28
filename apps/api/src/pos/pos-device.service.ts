import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Prisma } from '@prisma/client';

type PosDeviceMetaInput = Prisma.InputJsonValue;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function toJsonObject(value: Record<string, unknown>): Prisma.JsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.JsonObject;
}

@Injectable()
export class PosDeviceService {
  constructor(private readonly prisma: PrismaService) {}

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

  private buildMeta(input: unknown, userAgent?: string): PosDeviceMetaInput {
    const meta = isRecord(input) ? { ...input } : {};
    if (userAgent && !('userAgent' in meta)) {
      meta.userAgent = userAgent;
    }
    return toJsonObject(meta);
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
      where: { status: 'ACTIVE', deviceKeyHash: enrollmentHash },
    });

    if (!device) {
      throw new UnauthorizedException('Invalid enrollment code');
    }

    const deviceKey = randomBytes(32).toString('hex');
    const deviceKeyHash = this.hashDeviceKey(deviceKey);
    const meta = this.buildMeta(params.meta, params.userAgent);

    const updated = await this.prisma.posDevice.update({
      where: { id: device.id },
      data: {
        deviceKeyHash,
        meta,
        lastSeenAt: new Date(),
      },
    });

    return { device: updated, deviceKey };
  }

  async verifyDevice(params: { deviceStableId: string; deviceKey: string }) {
    const device = await this.prisma.posDevice.findUnique({
      where: { deviceStableId: params.deviceStableId },
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

    return device;
  }
}
