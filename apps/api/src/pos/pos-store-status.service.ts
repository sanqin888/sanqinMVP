import { BadRequestException, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { PosGateway } from './pos.gateway';

const AUTO_UNTIL_PREFIX = '__AUTO_UNTIL__:';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly posGateway: PosGateway,
  ) {}

  async getCustomerOrderingStatus() {
    const config = await this.ensureConfig();

    if (!config.isTemporarilyClosed) {
      return {
        isTemporarilyClosed: false,
        autoResumeAt: null,
      };
    }

    const parsed = parseAutoPauseReason(config.temporaryCloseReason);
    if (!parsed) {
      return {
        isTemporarilyClosed: true,
        autoResumeAt: null,
      };
    }

    const resumeAt = DateTime.fromISO(parsed.autoResumeAt);
    if (resumeAt.isValid && resumeAt <= DateTime.now()) {
      await this.prisma.businessConfig.update({
        where: { id: 1 },
        data: {
          isTemporarilyClosed: false,
          temporaryCloseReason: null,
        },
      });

      const status = {
        isTemporarilyClosed: false,
        autoResumeAt: null,
      };
      this.posGateway.publishCustomerOrderingStatusUpdate(status);

      return status;
    }

    return {
      isTemporarilyClosed: true,
      autoResumeAt: parsed.autoResumeAt,
    };
  }

  async pauseCustomerOrdering(input: {
    durationMinutes?: number;
    untilTomorrow?: boolean;
  }) {
    const config = await this.ensureConfig();
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

    const updated = await this.prisma.businessConfig.update({
      where: { id: 1 },
      data: {
        isTemporarilyClosed: true,
        temporaryCloseReason: buildAutoPauseReason(autoResumeAtIso),
      },
    });

    const status = {
      isTemporarilyClosed: updated.isTemporarilyClosed,
      autoResumeAt: autoResumeAtIso,
    };

    this.posGateway.publishCustomerOrderingStatusUpdate(status);

    return status;
  }

  async resumeCustomerOrdering() {
    const updated = await this.prisma.businessConfig.update({
      where: { id: 1 },
      data: {
        isTemporarilyClosed: false,
        temporaryCloseReason: null,
      },
    });

    const status = {
      isTemporarilyClosed: updated.isTemporarilyClosed,
      autoResumeAt: null,
    };

    this.posGateway.publishCustomerOrderingStatusUpdate(status);

    return status;
  }

  private async ensureConfig() {
    const existing = await this.prisma.businessConfig.findUnique({
      where: { id: 1 },
    });

    if (existing) return existing;

    return this.prisma.businessConfig.create({
      data: {
        id: 1,
        storeName: '',
        timezone: 'America/Toronto',
        isTemporarilyClosed: false,
        temporaryCloseReason: null,
        publicNotice: null,
        publicNoticeEn: null,
      },
    });
  }
}

export { parseAutoPauseReason };
