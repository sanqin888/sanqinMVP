import { Inject, Injectable } from '@nestjs/common';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
  type BrandStoreConfigSnapshot,
  type StoreConfigSnapshot,
} from '../store/public-api';
import type { BaseVars, Lang } from './template-vars';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const DEFAULT_STORE_ADDRESS = 'Unit 138-4750 Yonge St, North York';

export type MessagingConfigSnapshot = {
  baseVars: BaseVars;
  emailFromName: string;
  emailFromAddress: string;
  smsSignature: string;
  store: {
    name: string;
    address: string;
    phone?: string;
  };
};

/**
 * Legacy service name retained while existing Messaging consumers are migrated.
 * Configuration now comes exclusively from the canonical Brand/Store boundary.
 */
@Injectable()
export class BusinessConfigService {
  private cache?: BrandStoreConfigSnapshot;
  private cacheExpiresAt = 0;
  private inFlight?: Promise<BrandStoreConfigSnapshot>;

  constructor(
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly brandStoreConfigReader: BrandStoreConfigReaderPort,
  ) {}

  async getMessagingSnapshot(
    locale?: string,
  ): Promise<MessagingConfigSnapshot> {
    const config = await this.getCanonicalSnapshot();
    const resolvedLocale = this.resolveLocale(locale);
    const brandName =
      resolvedLocale === 'zh-CN'
        ? this.pickText(config.brand.brandNameZh, '三秦肉夹馍')
        : this.pickText(config.brand.brandNameEn, 'San Qin Roujiamo');
    const siteUrl = this.pickText(config.brand.siteUrl, 'https://sanq.ca');
    const supportEmail = this.pickText(
      config.brand.supportEmail,
      'support@sanq.ca',
    );
    const emailFromName =
      resolvedLocale === 'zh-CN'
        ? this.pickText(config.brand.emailFromNameZh, '三秦肉夹馍')
        : this.pickText(config.brand.emailFromNameEn, 'San Qin Rougamo');
    const emailFromAddress = this.pickText(
      config.brand.emailFromAddress,
      'no-reply@sanq.ca',
    );
    const smsSignature = this.pickText(
      config.brand.smsSignature,
      '【三秦肉夹馍（San Qin）】',
    );

    const storeAddress = this.resolveStoreAddress(config.store);
    const storeAddressLine = this.formatStoreAddressLine(
      storeAddress,
      resolvedLocale,
    );

    return {
      baseVars: {
        brandName,
        siteUrl,
        supportEmail,
        supportPhone: config.brand.supportPhone ?? undefined,
        storeAddressLine,
        smsSignature,
      },
      emailFromName,
      emailFromAddress,
      smsSignature,
      store: {
        name: this.pickText(config.store.storeName, brandName),
        address:
          this.resolveInvoiceStoreAddress(config.store) ??
          DEFAULT_STORE_ADDRESS,
        phone: config.store.phone ?? undefined,
      },
    };
  }

  private async getCanonicalSnapshot(): Promise<BrandStoreConfigSnapshot> {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiresAt) {
      return this.cache;
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.brandStoreConfigReader.getSnapshot();
    try {
      const value = await this.inFlight;
      this.cache = value;
      this.cacheExpiresAt = Date.now() + FIVE_MINUTES_MS;
      return value;
    } finally {
      this.inFlight = undefined;
    }
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

  private resolveStoreAddress(config: StoreConfigSnapshot): string | undefined {
    const parts = [config.addressLine1, config.addressLine2, config.city]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value);
    return parts.length > 0 ? parts.join(', ') : undefined;
  }

  private resolveInvoiceStoreAddress(
    config: StoreConfigSnapshot,
  ): string | undefined {
    const parts = [
      config.addressLine1,
      config.addressLine2,
      config.city,
      config.province,
      config.postalCode,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value);
    return parts.length > 0 ? parts.join(', ') : undefined;
  }

  private formatStoreAddressLine(address: string | undefined, locale: Lang) {
    const resolvedAddress = address?.trim() || DEFAULT_STORE_ADDRESS;
    if (locale === 'zh-CN') {
      return `门店地址：${resolvedAddress}`;
    }
    return `Store Address：${resolvedAddress}.`;
  }
}
