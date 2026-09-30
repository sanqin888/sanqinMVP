///Users/apple/sanqinMVP/apps/api/src/menu
import { Controller, Get, Inject } from '@nestjs/common';
import { PublicMenuService } from './public-menu.service';
import { PublicMenuResponse } from '@shared/menu';
import {
  BRAND_STORE_CONFIG_READER,
  type BrandStoreConfigReaderPort,
} from '../store/public-api';

@Controller('menu')
export class PublicMenuController {
  constructor(
    private readonly service: PublicMenuService,
    @Inject(BRAND_STORE_CONFIG_READER)
    private readonly storeConfig: BrandStoreConfigReaderPort,
  ) {}

  @Get('public')
  async getPublicMenu(): Promise<PublicMenuResponse> {
    const store = await this.storeConfig.getConfiguredStoreSnapshot();
    return this.service.getPublicMenu(store.storeStableId);
  }
}
