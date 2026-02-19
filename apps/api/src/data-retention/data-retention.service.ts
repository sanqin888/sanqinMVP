import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AuthChallengeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type CleanupStats = {
  userSessionsDeleted: number;
  trustedDevicesDeleted: number;
  authChallengesDeleted: number;
  userInvitesDeleted: number;
  checkoutIntentsDeleted: number;
  webhookEventsPayloadTrimmed: number;
  webhookEventsDeleted: number;
  deliveryEventsDeleted: number;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DataRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DataRetentionService.name);
  private readonly cleanupIntervalMs = this.readIntFromEnv(
    'DATA_RETENTION_INTERVAL_MS',
    12 * 60 * 60 * 1000,
  );
  private readonly inviteUsedRetentionDays = this.readIntFromEnv(
    'DATA_RETENTION_INVITE_USED_DAYS',
    90,
  );

  private intervalId?: NodeJS.Timeout;
  private isRunning = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.intervalId = setInterval(() => {
      void this.runCleanup();
    }, this.cleanupIntervalMs);

    void this.runCleanup();
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async runCleanup(now = new Date()): Promise<CleanupStats | null> {
    if (this.isRunning) {
      this.logger.warn(
        'Skipping retention cleanup because previous run is in progress.',
      );
      return null;
    }

    this.isRunning = true;

    try {
      const threshold30d = new Date(now.getTime() - 30 * ONE_DAY_MS);
      const threshold14d = new Date(now.getTime() - 14 * ONE_DAY_MS);
      const threshold180d = new Date(now.getTime() - 180 * ONE_DAY_MS);
      const thresholdInviteUsed = new Date(
        now.getTime() - this.inviteUsedRetentionDays * ONE_DAY_MS,
      );

      const stats = await this.prisma.$transaction(async (tx) => {
        const userSessionsDeleted = (
          await tx.userSession.deleteMany({
            where: { expiresAt: { lt: now } },
          })
        ).count;

        const trustedDevicesDeleted = (
          await tx.trustedDevice.deleteMany({
            where: { expiresAt: { lt: now } },
          })
        ).count;

        const authChallengesDeleted = (
          await tx.authChallenge.deleteMany({
            where: {
              status: {
                in: [AuthChallengeStatus.CONSUMED, AuthChallengeStatus.REVOKED],
              },
              consumedAt: { lt: threshold30d },
            },
          })
        ).count;

        const userInvitesDeleted = (
          await tx.userInvite.deleteMany({
            where: {
              OR: [
                {
                  expiresAt: { lt: now },
                  usedAt: null,
                },
                {
                  usedAt: { lt: thresholdInviteUsed },
                },
                {
                  revokedAt: { lt: threshold30d },
                },
              ],
            },
          })
        ).count;

        const checkoutIntentsDeleted = (
          await tx.checkoutIntent.deleteMany({
            where: {
              status: { not: 'succeeded' },
              createdAt: { lt: threshold14d },
            },
          })
        ).count;

        const webhookEventsPayloadTrimmed = (
          await tx.messagingWebhookEvent.updateMany({
            where: {
              createdAt: { lt: threshold30d },
              OR: [
                { rawBody: { not: null } },
                { headersJson: { not: Prisma.AnyNull } },
                { paramsJson: { not: Prisma.AnyNull } },
              ],
            },
            data: {
              rawBody: null,
              headersJson: Prisma.DbNull,
              paramsJson: Prisma.DbNull,
            },
          })
        ).count;

        const webhookEventsDeleted = (
          await tx.messagingWebhookEvent.deleteMany({
            where: {
              createdAt: { lt: threshold30d },
            },
          })
        ).count;

        const deliveryEventsDeleted = (
          await tx.messagingDeliveryEvent.deleteMany({
            where: {
              createdAt: { lt: threshold180d },
            },
          })
        ).count;

        return {
          userSessionsDeleted,
          trustedDevicesDeleted,
          authChallengesDeleted,
          userInvitesDeleted,
          checkoutIntentsDeleted,
          webhookEventsPayloadTrimmed,
          webhookEventsDeleted,
          deliveryEventsDeleted,
        };
      });

      this.logger.log(
        [
          `Retention cleanup finished`,
          `sessions=${stats.userSessionsDeleted}`,
          `devices=${stats.trustedDevicesDeleted}`,
          `challenges=${stats.authChallengesDeleted}`,
          `invites=${stats.userInvitesDeleted}`,
          `checkoutIntents=${stats.checkoutIntentsDeleted}`,
          `webhookPayloadsTrimmed=${stats.webhookEventsPayloadTrimmed}`,
          `webhookEvents=${stats.webhookEventsDeleted}`,
          `deliveryEvents=${stats.deliveryEventsDeleted}`,
        ].join(' | '),
      );

      return stats;
    } catch (error) {
      this.logger.error(
        'Retention cleanup failed',
        (error as Error)?.stack ?? String(error),
      );
      return null;
    } finally {
      this.isRunning = false;
    }
  }

  private readIntFromEnv(key: string, fallback: number): number {
    const raw = process.env[key];
    if (!raw) return fallback;

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      this.logger.warn(
        `Invalid ${key}="${raw}", falling back to default ${fallback}.`,
      );
      return fallback;
    }

    return parsed;
  }
}
