import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type IngestEventInput = {
  event: string;
  payload?: Record<string, unknown>;
  ts?: number;
};

type IngestContext = {
  locale?: string | null;
  path?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
};

type AnalyticsEventRow = {
  id: string;
  eventName: string;
  source: string;
  locale: string | null;
  path: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  payload: Prisma.JsonValue | null;
  occurredAt: Date;
  createdAt: Date;
};

const MAX_BATCH_SIZE = 50;
const MAX_EVENT_NAME_LENGTH = 120;
const MAX_PAYLOAD_KEYS = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEventName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('event must be a string');
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new BadRequestException('event cannot be empty');
  }

  if (normalized.length > MAX_EVENT_NAME_LENGTH) {
    throw new BadRequestException(
      `event length must be <= ${MAX_EVENT_NAME_LENGTH}`,
    );
  }

  return normalized;
}

function normalizePayload(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;

  if (!isRecord(value)) {
    throw new BadRequestException('payload must be a plain object');
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_PAYLOAD_KEYS) {
    throw new BadRequestException(
      `payload keys must be <= ${MAX_PAYLOAD_KEYS}`,
    );
  }

  return value as Prisma.InputJsonValue;
}

function normalizeTimestamp(value: unknown): Date {
  if (typeof value !== 'number' || !Number.isFinite(value)) return new Date();

  const ms = value > 1e12 ? value : value * 1000;
  const parsed = new Date(ms);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function normalizeOptionalText(value: unknown, maxLen = 255): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLen);
}

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2010' &&
    String((error as { meta?: { code?: string } }).meta?.code ?? '') === '42P01'
  );
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestBatch(
    events: IngestEventInput[],
    context: IngestContext,
  ): Promise<number> {
    if (!Array.isArray(events) || events.length === 0) {
      throw new BadRequestException('events must be a non-empty array');
    }

    if (events.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(
        `events batch size must be <= ${MAX_BATCH_SIZE}`,
      );
    }

    const normalizedContext = {
      locale: normalizeOptionalText(context.locale, 16),
      path: normalizeOptionalText(context.path, 500),
      userAgent: normalizeOptionalText(context.userAgent, 500),
      ipAddress: normalizeOptionalText(context.ipAddress, 64),
    };

    const rows = events.map((item) => ({
      eventName: normalizeEventName(item?.event),
      payload: normalizePayload(item?.payload),
      occurredAt: normalizeTimestamp(item?.ts),
    }));

    try {
      await this.prisma.$transaction(
        rows.map(
          (row) =>
            this.prisma.$executeRaw`
            INSERT INTO "AnalyticsEvent" (
              "eventName",
              "source",
              "locale",
              "path",
              "userAgent",
              "ipAddress",
              "payload",
              "occurredAt"
            ) VALUES (
              ${row.eventName},
              ${'web'},
              ${normalizedContext.locale},
              ${normalizedContext.path},
              ${normalizedContext.userAgent},
              ${normalizedContext.ipAddress},
              ${row.payload ?? null}::jsonb,
              ${row.occurredAt}
            )
          `,
        ),
      );
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new ServiceUnavailableException(
          'AnalyticsEvent table is missing. Please run Prisma migration first.',
        );
      }
      throw error;
    }

    return rows.length;
  }

  async listRecent(params: {
    limit?: number;
    event?: string;
  }): Promise<AnalyticsEventRow[]> {
    const limit = Number.isFinite(params.limit)
      ? Math.min(Math.max(Math.floor(params.limit as number), 1), 200)
      : 100;

    const eventName = normalizeOptionalText(
      params.event,
      MAX_EVENT_NAME_LENGTH,
    );
    const whereClause = eventName
      ? Prisma.sql`WHERE "eventName" = ${eventName}`
      : Prisma.sql``;

    try {
      return await this.prisma.$queryRaw<AnalyticsEventRow[]>`
        SELECT
          "id",
          "eventName",
          "source",
          "locale",
          "path",
          "userAgent",
          "ipAddress",
          "payload",
          "occurredAt",
          "createdAt"
        FROM "AnalyticsEvent"
        ${whereClause}
        ORDER BY "occurredAt" DESC
        LIMIT ${limit}
      `;
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new ServiceUnavailableException(
          'AnalyticsEvent table is missing. Please run Prisma migration first.',
        );
      }
      throw error;
    }
  }
}
