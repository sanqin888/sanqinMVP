import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BrandStoreConfigUnavailableError,
  resolveConfiguredStoreStableId,
  type BrandConfigSnapshot,
  type BrandStoreConfigReaderPort,
  type BrandStoreConfigSnapshot,
  type StoreConfigSnapshot,
} from './public-api';

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
