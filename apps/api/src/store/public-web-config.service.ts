import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from './brand-store-config.contract';

export type PublicWebConfig = {
  store: {
    storeStableId: string;
    latitude: number;
    longitude: number;
  };
  maps: {
    browserKey: string;
  };
};

@Injectable()
export class PublicWebConfigService {
  constructor(
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly configReader: BrandStoreConfigReaderPort,
  ) {}

  async getConfig(): Promise<PublicWebConfig> {
    const store = await this.configReader.getConfiguredStoreSnapshot();
    const browserKey = process.env.GOOGLE_MAPS_BROWSER_KEY?.trim();

    if (!browserKey) {
      throw new ServiceUnavailableException({
        code: 'PUBLIC_WEB_CONFIG_UNAVAILABLE',
        message: 'Public web configuration is unavailable',
      });
    }

    if (
      store.latitude == null ||
      store.longitude == null ||
      !Number.isFinite(store.latitude) ||
      !Number.isFinite(store.longitude) ||
      store.latitude < -90 ||
      store.latitude > 90 ||
      store.longitude < -180 ||
      store.longitude > 180
    ) {
      throw new ServiceUnavailableException({
        code: 'PUBLIC_WEB_CONFIG_UNAVAILABLE',
        message: 'Public web configuration is unavailable',
      });
    }

    return {
      store: {
        storeStableId: store.storeStableId,
        latitude: store.latitude,
        longitude: store.longitude,
      },
      maps: {
        browserKey,
      },
    };
  }
}
