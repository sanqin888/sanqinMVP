import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/app-logger';
import {
  DEFAULT_POS_CONNECTIVITY_OFFLINE_AFTER_MS,
  DEFAULT_POS_CONNECTIVITY_RECOVERY_STABLE_MS,
  DEFAULT_POS_CONNECTIVITY_WATCH_INTERVAL_MS,
  readPositiveDurationMs,
  resolvePosConnectivityStatus,
} from '../common/pos-connectivity';
import {
  UBER_EATS_STORE_STATUS_SYNC,
  type UberEatsStoreStatusSyncPort,
} from '../integrations/ubereats/public-api';
import { StoreStatusService } from '../store/store-status.service';

type RuntimeState = {
  phase: 'ONLINE' | 'OFFLINE' | 'RECOVERING';
  recoverySince: number | null;
  pauseConfirmed: boolean;
  nextSyncAttemptAt: number;
  syncFailures: number;
};

@Injectable()
export class PosConnectivityWatchdogService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new AppLogger(PosConnectivityWatchdogService.name);
  private readonly watchIntervalMs = readPositiveDurationMs(
    process.env.POS_CONNECTIVITY_WATCH_INTERVAL_MS,
    DEFAULT_POS_CONNECTIVITY_WATCH_INTERVAL_MS,
  );
  private readonly offlineAfterMs = readPositiveDurationMs(
    process.env.POS_CONNECTIVITY_HEARTBEAT_TIMEOUT_MS,
    DEFAULT_POS_CONNECTIVITY_OFFLINE_AFTER_MS,
  );
  private readonly recoveryStableMs = readPositiveDurationMs(
    process.env.POS_CONNECTIVITY_RECOVERY_STABLE_MS,
    DEFAULT_POS_CONNECTIVITY_RECOVERY_STABLE_MS,
  );
  private readonly states = new Map<string, RuntimeState>();
  private timer?: NodeJS.Timeout;
  private inFlight?: Promise<void>;
  private stopping = false;
  private scheduleOpen: boolean | null = null;
  private openingGraceUntil = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(UBER_EATS_STORE_STATUS_SYNC)
    private readonly uber: UberEatsStoreStatusSyncPort,
    private readonly storeStatus: StoreStatusService,
  ) {}

  onModuleInit(): void {
    this.schedule(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    await this.inFlight?.catch(() => undefined);
  }

  runOnce(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const run = this.poll().finally(() => {
      if (this.inFlight === run) this.inFlight = undefined;
    });
    this.inFlight = run;
    return run;
  }

  private schedule(delayMs: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch((error) => {
          this.logger.error(
            `POS connectivity watchdog failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        })
        .finally(() => this.schedule(this.watchIntervalMs));
    }, delayMs);
    this.timer.unref?.();
  }

  private async poll(): Promise<void> {
    const now = Date.now();
    const schedule = await this.storeStatus.getCurrentStatus();
    if (!schedule.isOpenBySchedule) {
      this.scheduleOpen = false;
      this.openingGraceUntil = 0;
      return;
    }

    if (this.scheduleOpen !== true) {
      this.scheduleOpen = true;
      this.openingGraceUntil = now + this.offlineAfterMs;
    }
    if (now < this.openingGraceUntil) return;

    const devices = await this.prisma.posDevice.findMany({
      where: { status: 'ACTIVE' },
      select: { storeId: true, lastSeenAt: true, meta: true },
    });
    const byStore = new Map<
      string,
      Array<{ lastSeenAt: Date | null; meta: unknown }>
    >();
    for (const device of devices) {
      const current = byStore.get(device.storeId) ?? [];
      current.push({ lastSeenAt: device.lastSeenAt, meta: device.meta });
      byStore.set(device.storeId, current);
    }

    for (const [storeId, storeDevices] of byStore) {
      const connectivity = resolvePosConnectivityStatus(
        storeDevices,
        now,
        this.offlineAfterMs,
      );
      if (connectivity.status === 'UNKNOWN') continue;
      if (connectivity.status === 'OFFLINE') {
        await this.handleOffline(storeId, connectivity.lastHeartbeatAt, now);
      } else {
        await this.handleOnline(storeId, now);
      }
    }
  }

  private async handleOffline(
    storeId: string,
    lastHeartbeatAt: Date | null,
    now: number,
  ): Promise<void> {
    const previous = this.states.get(storeId);
    if (!previous || previous.phase !== 'OFFLINE') {
      this.states.set(storeId, {
        phase: 'OFFLINE',
        recoverySince: null,
        pauseConfirmed: false,
        nextSyncAttemptAt: 0,
        syncFailures: 0,
      });
      this.logger.warn({
        event: 'pos_connectivity_offline',
        storeId,
        lastHeartbeatAt: lastHeartbeatAt?.toISOString() ?? null,
      });
    }

    const state = this.states.get(storeId)!;
    if (state.pauseConfirmed || now < state.nextSyncAttemptAt) return;
    const synced = await this.syncMappedUberStores(storeId, 'PAUSED');
    if (synced) {
      state.pauseConfirmed = true;
      state.syncFailures = 0;
      return;
    }

    state.syncFailures += 1;
    state.nextSyncAttemptAt = now + this.retryDelayMs(state.syncFailures);
    this.logger.error({
      event: 'pos_connectivity_uber_pause_failed',
      storeId,
      retryInMs: state.nextSyncAttemptAt - now,
    });
  }

  private async handleOnline(storeId: string, now: number): Promise<void> {
    const previous = this.states.get(storeId);
    if (!previous) {
      this.states.set(storeId, {
        phase: 'ONLINE',
        recoverySince: null,
        pauseConfirmed: false,
        nextSyncAttemptAt: 0,
        syncFailures: 0,
      });
      return;
    }
    if (previous.phase === 'ONLINE') return;

    if (previous.phase === 'OFFLINE') {
      previous.phase = 'RECOVERING';
      previous.recoverySince = now;
      previous.nextSyncAttemptAt = 0;
      previous.syncFailures = 0;
      return;
    }

    if (
      previous.recoverySince === null ||
      now - previous.recoverySince < this.recoveryStableMs ||
      now < previous.nextSyncAttemptAt
    ) {
      return;
    }

    const config = await this.prisma.businessConfig.findUnique({
      where: { id: 1 },
      select: { isTemporarilyClosed: true },
    });
    if (config?.isTemporarilyClosed) {
      previous.phase = 'ONLINE';
      previous.recoverySince = null;
      previous.pauseConfirmed = false;
      this.logger.log({
        event: 'pos_connectivity_restored',
        storeId,
        uberStatus: 'UNCHANGED_MANUAL_PAUSE',
      });
      return;
    }

    const synced = await this.syncMappedUberStores(storeId, 'ONLINE');
    if (!synced) {
      previous.syncFailures += 1;
      previous.nextSyncAttemptAt = now + this.retryDelayMs(previous.syncFailures);
      this.logger.error({
        event: 'pos_connectivity_uber_resume_failed',
        storeId,
        retryInMs: previous.nextSyncAttemptAt - now,
      });
      return;
    }

    previous.phase = 'ONLINE';
    previous.recoverySince = null;
    previous.pauseConfirmed = false;
    previous.syncFailures = 0;
    this.logger.log({
      event: 'pos_connectivity_restored',
      storeId,
      uberStatus: 'ONLINE',
    });
  }

  private async syncMappedUberStores(
    posStoreId: string,
    targetStatus: 'ONLINE' | 'PAUSED',
  ): Promise<boolean> {
    const mappings = await this.prisma.uberStoreMapping.findMany({
      where: { posExternalStoreId: posStoreId, isProvisioned: true },
      select: { uberStoreId: true },
    });
    for (const mapping of mappings) {
      const result = await this.uber.syncStoreStatusToUber({
        uberStoreId: mapping.uberStoreId,
        targetStatus,
        ...(targetStatus === 'PAUSED'
          ? { reason: 'POS connectivity lost' }
          : {}),
      });
      if (result.outcome === 'FAILED') return false;
    }
    return true;
  }

  private retryDelayMs(failures: number): number {
    return Math.min(5 * 60_000, 30_000 * 2 ** Math.max(0, failures - 1));
  }
}
