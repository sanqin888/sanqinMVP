import { Injectable } from '@nestjs/common';
import type { BusinessConfig } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { BaseVars, Lang } from './template-vars';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export type MessagingConfigSnapshot = {
  baseVars: BaseVars;
  emailFromName: string;
  emailFromAddress: string;
  smsSignature: string;
};

@Injectable()
export class BusinessConfigService {
  private cache?: BusinessConfig;
  private cacheExpiresAt = 0;
  private inFlight?: Promise<BusinessConfig>;

  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(): Promise<BusinessConfig> {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiresAt) {
      return this.cache;
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.fetchConfig();
    try {
      const value = await this.inFlight;
      this.cache = value;
      this.cacheExpiresAt = Date.now() + FIVE_MINUTES_MS;
      return value;
    } finally {
      this.inFlight = undefined;
    }
  }

  async getMessagingSnapshot(locale?: string): Promise<MessagingConfigSnapshot> {
    const config = await this.getSnapshot();
    const resolvedLocale = this.resolveLocale(locale);
    const brandName =
      resolvedLocale === 'zh-CN'
        ? this.pickText(config.brandNameZh, '三秦肉夹馍')
        : this.pickText(config.brandNameEn, 'San Qin Roujiamo');
    const siteUrl = this.pickText(config.siteUrl, 'https://sanq.ca');
    const supportEmail = this.pickText(config.supportEmail, 'support@sanq.ca');
    const emailFromName =
      resolvedLocale === 'zh-CN'
        ? this.pickText(config.emailFromNameZh, '三秦肉夹馍')
        : this.pickText(config.emailFromNameEn, 'San Qin Rougamo');
    const emailFromAddress = this.pickText(
      config.emailFromAddress,
      'no-reply@sanq.ca',
    );
    const smsSignature = this.pickText(
      config.smsSignature,
      '【三秦肉夹馍（San Qin）】',
    );

    const storeAddress = this.resolveStoreAddress(config);
    const storeAddressLine = this.formatStoreAddressLine(
      storeAddress,
      resolvedLocale,
    );

    return {
      baseVars: {
        brandName,
        siteUrl,
        supportEmail,
        supportPhone: config.supportPhone ?? undefined,
        storeAddressLine,
        smsSignature,
      },
      emailFromName,
      emailFromAddress,
      smsSignature,
    };
  }

  private resolveLocale(locale?: string): Lang {
    const normalized = locale?.toLowerCase() ?? '';
    if (normalized === 'zh-cn' || normalized.startsWith('zh')) {
      return 'zh-CN';
    }
    return 'en';
  }

  private pickText(value: string | null | undefined, fallback: string): string {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : fallback;
  }

  private resolveStoreAddress(config: BusinessConfig): string | undefined {
    const parts = [
      config.storeAddressLine1,
      config.storeAddressLine2,
      config.storeCity,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value);
    return parts.length > 0 ? parts.join(', ') : undefined;
  }

  private formatStoreAddressLine(address: string | undefined, locale: Lang) {
    const fallback = 'Unit 138-4750 Yonge St, North York';
    const resolvedAddress = address?.trim() || fallback;
    if (locale === 'zh-CN') {
      return `门店地址：${resolvedAddress}`;
    }
    return `Store Address：${resolvedAddress}.`;
  }

  private async fetchConfig(): Promise<BusinessConfig> {
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
