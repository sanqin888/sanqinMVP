import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BrandStoreConfigUnavailableError,
  type BrandConfigSnapshot,
  type BrandStoreConfigReaderPort,
  type BrandStoreConfigSnapshot,
  type BrandStoreConfigUpdateInput,
  type BrandStoreConfigWriterPort,
  type StoreConfigSnapshot,
} from './brand-store-config.contract';
import { resolveConfiguredStoreStableId } from './store-identity';

@Injectable()
export class PrismaBrandStoreConfigReader implements BrandStoreConfigReaderPort {
  constructor(private readonly prisma: PrismaService) {}

  async getBrandSnapshot(): Promise<BrandConfigSnapshot> {
    const brand = await this.prisma.brandConfig.findUnique({
      where: { id: 1 },
      select: {
        brandNameZh: true,
        brandNameEn: true,
        siteUrl: true,
        emailFromNameZh: true,
        emailFromNameEn: true,
        emailFromAddress: true,
        smsSignature: true,
        supportPhone: true,
        supportEmail: true,
        wechatAlipayExchangeRate: true,
      },
    });

    if (!brand) {
      throw new BrandStoreConfigUnavailableError(
        'BrandConfig(id=1) is not provisioned',
      );
    }

    return brand;
  }

  async getStoreSnapshot(): Promise<StoreConfigSnapshot> {
    const storeStableId = resolveConfiguredStoreStableId();
    const store = await this.prisma.store.findUnique({
      where: { storeStableId },
      select: {
        storeStableId: true,
        name: true,
        isActive: true,
        config: {
          select: {
            timezone: true,
            isTemporarilyClosed: true,
            temporaryCloseReason: true,
            publicNotice: true,
            publicNoticeEn: true,
            deliveryBaseFeeCents: true,
            priorityPerKmCents: true,
            maxDeliveryRangeKm: true,
            priorityDefaultDistanceKm: true,
            latitude: true,
            longitude: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            province: true,
            postalCode: true,
            countryCode: true,
            phone: true,
            contactName: true,
            salesTaxRate: true,
            enableUberDirect: true,
            autoAcceptOnlineOrders: true,
            allergyHandlingMode: true,
            unsupportedAllergens: true,
          },
        },
      },
    });

    if (!store) {
      throw new BrandStoreConfigUnavailableError(
        `Configured store ${storeStableId} is not provisioned`,
      );
    }
    if (!store.config) {
      throw new BrandStoreConfigUnavailableError(
        `StoreConfig for ${storeStableId} is not provisioned`,
      );
    }

    return {
      storeStableId: store.storeStableId,
      storeName: store.name,
      isActive: store.isActive,
      ...store.config,
    };
  }

  async getSnapshot(): Promise<BrandStoreConfigSnapshot> {
    const [brand, store] = await Promise.all([
      this.getBrandSnapshot(),
      this.getStoreSnapshot(),
    ]);
    return { brand, store };
  }
}

const BRAND_COMPATIBILITY_SELECT = {
  brandNameZh: true,
  brandNameEn: true,
  siteUrl: true,
  emailFromNameZh: true,
  emailFromNameEn: true,
  emailFromAddress: true,
  smsSignature: true,
  supportPhone: true,
  supportEmail: true,
  wechatAlipayExchangeRate: true,
} as const;

const STORE_COMPATIBILITY_SELECT = {
  timezone: true,
  isTemporarilyClosed: true,
  temporaryCloseReason: true,
  publicNotice: true,
  publicNoticeEn: true,
  deliveryBaseFeeCents: true,
  priorityPerKmCents: true,
  maxDeliveryRangeKm: true,
  priorityDefaultDistanceKm: true,
  latitude: true,
  longitude: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  province: true,
  postalCode: true,
  salesTaxRate: true,
  enableUberDirect: true,
} as const;

@Injectable()
export class PrismaBrandStoreConfigWriter implements BrandStoreConfigWriterPort {
  constructor(private readonly prisma: PrismaService) {}

  // @compat brand-store.business-config.v1
  // Canonical BrandConfig/StoreConfig are the write targets. The complete
  // overlapping Brand/Store snapshot is copied back to BusinessConfig only
  // while POS still writes that compatibility model and its one-way trigger can
  // replay the legacy row into canonical storage.
  async updateConfig(input: BrandStoreConfigUpdateInput): Promise<void> {
    const brandPatch = input.brand ?? {};
    const storePatch = input.store ?? {};
    const hasBrandPatch = Object.keys(brandPatch).length > 0;
    const hasStorePatch = Object.keys(storePatch).length > 0;
    const hasCompatibilityPatch =
      hasBrandPatch ||
      Object.keys(storePatch).some((key) => key in STORE_COMPATIBILITY_SELECT);

    if (!hasBrandPatch && !hasStorePatch) return;

    const storeStableId = resolveConfiguredStoreStableId();

    if (!hasCompatibilityPatch) {
      await this.prisma.$transaction(async (tx) => {
        const store = await tx.store.findUnique({
          where: { storeStableId },
          select: { id: true, config: { select: { storeId: true } } },
        });
        if (!store) {
          throw new BrandStoreConfigUnavailableError(
            `Configured store ${storeStableId} is not provisioned`,
          );
        }
        if (!store.config) {
          throw new BrandStoreConfigUnavailableError(
            `StoreConfig for ${storeStableId} is not provisioned`,
          );
        }
        await tx.storeConfig.update({
          where: { storeId: store.id },
          data: storePatch,
        });
      });
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const [brand, store] = await Promise.all([
        tx.brandConfig.findUnique({
          where: { id: 1 },
          select: BRAND_COMPATIBILITY_SELECT,
        }),
        tx.store.findUnique({
          where: { storeStableId },
          select: {
            id: true,
            name: true,
            config: { select: STORE_COMPATIBILITY_SELECT },
          },
        }),
      ]);

      if (!brand) {
        throw new BrandStoreConfigUnavailableError(
          'BrandConfig(id=1) is not provisioned',
        );
      }
      if (!store) {
        throw new BrandStoreConfigUnavailableError(
          `Configured store ${storeStableId} is not provisioned`,
        );
      }
      if (!store.config) {
        throw new BrandStoreConfigUnavailableError(
          `StoreConfig for ${storeStableId} is not provisioned`,
        );
      }

      const nextBrand = hasBrandPatch
        ? await tx.brandConfig.update({
            where: { id: 1 },
            data: brandPatch,
            select: BRAND_COMPATIBILITY_SELECT,
          })
        : brand;

      const nextStore = hasStorePatch
        ? await tx.storeConfig.update({
            where: { storeId: store.id },
            data: storePatch,
            select: STORE_COMPATIBILITY_SELECT,
          })
        : store.config;

      await tx.businessConfig.update({
        where: { id: 1 },
        data: {
          storeName: store.name,
          timezone: nextStore.timezone,
          isTemporarilyClosed: nextStore.isTemporarilyClosed,
          temporaryCloseReason: nextStore.temporaryCloseReason,
          publicNotice: nextStore.publicNotice,
          publicNoticeEn: nextStore.publicNoticeEn,
          deliveryBaseFeeCents: nextStore.deliveryBaseFeeCents,
          priorityPerKmCents: nextStore.priorityPerKmCents,
          maxDeliveryRangeKm: nextStore.maxDeliveryRangeKm,
          priorityDefaultDistanceKm: nextStore.priorityDefaultDistanceKm,
          storeLatitude: nextStore.latitude,
          storeLongitude: nextStore.longitude,
          storeAddressLine1: nextStore.addressLine1,
          storeAddressLine2: nextStore.addressLine2,
          storeCity: nextStore.city,
          storeProvince: nextStore.province,
          storePostalCode: nextStore.postalCode,
          brandNameZh: nextBrand.brandNameZh,
          brandNameEn: nextBrand.brandNameEn,
          siteUrl: nextBrand.siteUrl,
          emailFromNameZh: nextBrand.emailFromNameZh,
          emailFromNameEn: nextBrand.emailFromNameEn,
          emailFromAddress: nextBrand.emailFromAddress,
          smsSignature: nextBrand.smsSignature,
          supportPhone: nextBrand.supportPhone,
          supportEmail: nextBrand.supportEmail,
          salesTaxRate: nextStore.salesTaxRate,
          wechatAlipayExchangeRate: nextBrand.wechatAlipayExchangeRate,
          enableUberDirect: nextStore.enableUberDirect,
        },
      });
    });
  }
}

@Injectable()
export class PrismaStoreScheduleReader {
  constructor(private readonly prisma: PrismaService) {}

  listHolidays() {
    return this.prisma.holiday.findMany();
  }

  getBusinessHour(weekday: number) {
    return this.prisma.businessHour.findUnique({ where: { weekday } });
  }
}
