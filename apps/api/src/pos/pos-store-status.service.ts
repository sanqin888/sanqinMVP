import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PosGateway } from './pos.gateway';
import {
  UBER_EATS_STORE_STATUS_SYNC,
  type UberEatsStoreStatusSyncPort,
} from '../integrations/ubereats/public-api';
import { AppLogger } from '../common/app-logger';
import {
  BRAND_STORE_CONFIG_READER,
  BRAND_STORE_CONFIG_WRITER,
  type BrandStoreConfigReaderPort,
  type BrandStoreConfigWriterPort,
} from '../store/public-api';

const AUTO_UNTIL_PREFIX = '__AUTO_UNTIL__:';

export type PosStoreStatusActionContext = {
  operatorUserId?: string;
  operatorRole?: string;
  posDeviceStableId?: string;
  posDeviceName?: string | null;
};

function parseAutoPauseReason(reason: string | null | undefined): {
  autoResumeAt: string;
  displayReason: string | null;
} | null {
  if (!reason || !reason.startsWith(AUTO_UNTIL_PREFIX)) return null;

  const payload = reason.slice(AUTO_UNTIL_PREFIX.length);
  const splitIndex = payload.indexOf('|');
  const autoResumeAt = (
    splitIndex >= 0 ? payload.slice(0, splitIndex) : payload
  ).trim();
  const displayReasonRaw = splitIndex >= 0 ? payload.slice(splitIndex + 1) : '';
  const displayReason = displayReasonRaw.trim() || null;

  if (!autoResumeAt) return null;
  return { autoResumeAt, displayReason };
}

function buildAutoPauseReason(
  autoResumeAt: string,
  displayReason?: string | null,
): string {
  const suffix = displayReason?.trim() ? `|${displayReason.trim()}` : '|';
  return `${AUTO_UNTIL_PREFIX}${autoResumeAt}${suffix}`;
}

@Injectable()
export class PosStoreStatusService {
  private readonly logger = new AppLogger(PosStoreStatusService.name);

  constructor(
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly configReader: BrandStoreConfigReaderPort,
    @Inject(BRAND_STORE_CONFIG_WRITER)
    private readonly configWriter: BrandStoreConfigWriterPort,
    private readonly posGateway: PosGateway,
    @Inject(UBER_EATS_STORE_STATUS_SYNC)
    private readonly uberEatsService: UberEatsStoreStatusSyncPort,
  ) {}

  async getCustomerOrderingStatus(storeStableId: string) {
    await this.reconcileExpiredPause(storeStableId);
    const config = await this.configReader.getStoreSnapshot(storeStableId);

    if (!config.isTemporarilyClosed) {
      return {
        isTemporarilyClosed: false,
        autoResumeAt: null,
      };
    }

    const parsed = parseAutoPauseReason(config.temporaryCloseReason);
    return {
      isTemporarilyClosed: true,
      autoResumeAt: parsed?.autoResumeAt ?? null,
    };
  }

  async reconcileExpiredPause(storeStableId: string): Promise<boolean> {
    const config = await this.configReader.getStoreSnapshot(storeStableId);
    if (!config.isTemporarilyClosed || !config.temporaryCloseReason)
      return false;

    const parsed = parseAutoPauseReason(config.temporaryCloseReason);
    if (!parsed) return false;

    const resumeAt = DateTime.fromISO(parsed.autoResumeAt);
    if (!resumeAt.isValid || resumeAt > DateTime.now()) return false;

    const resumed = await this.configWriter.resumeTemporaryClosureIfMatches(
      storeStableId,
      config.temporaryCloseReason,
    );
    if (!resumed) return false;

    await this.finalizeResume(
      storeStableId,
      'auto_resume',
      undefined,
      parsed.autoResumeAt,
    );
    return true;
  }

  async pauseCustomerOrdering(
    storeStableId: string,
    input: {
      durationMinutes?: number;
      untilTomorrow?: boolean;
    },
    context?: PosStoreStatusActionContext,
  ) {
    const config = await this.configReader.getStoreSnapshot(storeStableId);
    const timezone = config.timezone || 'America/Toronto';
    const nowInStoreTz = DateTime.now().setZone(timezone);

    let autoResumeAt: DateTime;
    if (input.untilTomorrow) {
      autoResumeAt = nowInStoreTz.plus({ days: 1 }).startOf('day');
    } else {
      const durationMinutes = input.durationMinutes;
      if (!durationMinutes || durationMinutes <= 0) {
        throw new BadRequestException(
          'durationMinutes must be a positive integer',
        );
      }
      autoResumeAt = nowInStoreTz.plus({ minutes: durationMinutes });
    }

    const autoResumeAtIso = autoResumeAt.toISO({
      includeOffset: true,
      suppressMilliseconds: true,
    });
    if (!autoResumeAtIso) {
      throw new BadRequestException('Failed to calculate auto-resume time');
    }

    await this.configWriter.updateConfig(
      {
        store: {
          isTemporarilyClosed: true,
          temporaryCloseReason: buildAutoPauseReason(autoResumeAtIso),
        },
      },
      storeStableId,
    );

    const status = {
      isTemporarilyClosed: true,
      autoResumeAt: autoResumeAtIso,
    };

    this.logger.log({
      event: 'pos_store_paused',
      storeStableId,
      durationMinutes: input.untilTomorrow
        ? null
        : (input.durationMinutes ?? null),
      untilTomorrow: input.untilTomorrow === true,
      autoResumeAt: autoResumeAtIso,
      operatorUserId: context?.operatorUserId ?? null,
      operatorRole: context?.operatorRole ?? null,
      posDeviceStableId: context?.posDeviceStableId ?? null,
      posDeviceName: context?.posDeviceName ?? null,
    });
    this.posGateway.publishCustomerOrderingStatusUpdate(status);
    await this.syncUberStoreStatusSafely('pause');

    return status;
  }

  async resumeCustomerOrdering(
    storeStableId: string,
    context?: PosStoreStatusActionContext,
  ) {
    await this.configWriter.updateConfig(
      {
        store: {
          isTemporarilyClosed: false,
          temporaryCloseReason: null,
        },
      },
      storeStableId,
    );

    return this.finalizeResume(storeStableId, 'resume', context);
  }

  private async finalizeResume(
    storeStableId: string,
    source: 'resume' | 'auto_resume',
    context?: PosStoreStatusActionContext,
    autoResumeAt?: string,
  ) {
    const status = {
      isTemporarilyClosed: false,
      autoResumeAt: null,
    };

    this.logger.log({
      storeStableId,
      event:
        source === 'auto_resume'
          ? 'pos_store_auto_resumed'
          : 'pos_store_resumed',
      autoResumeAt: autoResumeAt ?? null,
      operatorUserId: context?.operatorUserId ?? null,
      operatorRole: context?.operatorRole ?? null,
      posDeviceStableId: context?.posDeviceStableId ?? null,
      posDeviceName: context?.posDeviceName ?? null,
    });
    this.posGateway.publishCustomerOrderingStatusUpdate(status);
    await this.syncUberStoreStatusSafely(source);

    return status;
  }

  private async syncUberStoreStatusSafely(
    source: 'pause' | 'resume' | 'auto_resume',
  ) {
    try {
      await this.uberEatsService.syncStoreStatusToUber();
    } catch (error) {
      // Uber 同步失败不应阻塞 POS 端状态更新
      const message = error instanceof Error ? error.message : `${error}`;
      this.logger.warn(
        `Failed to sync Uber store status after ${source}: ${message}`,
      );
    }
  }
}

export { parseAutoPauseReason };
