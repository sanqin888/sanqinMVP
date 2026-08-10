import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { AppLogger } from '../../common/app-logger';

import {
  OptionalResourceIdPipe,
  ResourceIdPipe,
} from './contracts/requests/resource-id.pipe';
import {
  UberAdminWrite,
  UberMfaAdminWrite,
  UberReadOnlyAdmin,
} from './ubereats-access.decorator';
import {
  PublishUberMenuDto,
  SyncUberMenuItemAvailabilityDto,
  SyncUberOptionItemAvailabilityDto,
  UpdateUberDraftGroupDto,
  UpdateUberDraftItemDto,
  UpdateUberDraftOptionChildGroupDto,
  UpdateUberDraftOptionDto,
  UpsertUberOptionItemConfigDto,
  UpsertUberPriceBookItemDto,
} from './contracts/requests/ubereats.requests';
import { UberMenuService } from './uber-menu.service';

@Controller('integrations/ubereats')
@UberReadOnlyAdmin()
export class UberEatsMenuController {
  private readonly logger = new AppLogger(UberEatsMenuController.name);
  constructor(private readonly menu: UberMenuService) {}
  @Get('menu/channel/items')
  async listItemChannelConfigs(
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return await this.menu.listUberItemChannelConfigs(storeId);
  }

  @Get('menu/published/items')
  async listPublishedMenuItems(
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return await this.menu.listUberPublishedMenuItems(storeId);
  }

  @Post('menu/channel/items/:menuItemStableId')
  @UberAdminWrite()
  async upsertItemChannelConfig(
    @Param('menuItemStableId', ResourceIdPipe) menuItemStableId: string,
    @Body() dto: UpsertUberPriceBookItemDto,
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return await this.menu.upsertUberItemChannelConfig({
      storeId,
      menuItemStableId,
      priceCents: dto.priceCents,
      isAvailable: dto.isAvailable,
      displayName: dto.displayName,
      displayDescription: dto.displayDescription,
    });
  }

  @Get('menu/channel/options')
  async listOptionChannelConfigs(
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return await this.menu.listUberOptionItemConfigs(storeId);
  }

  @Post('menu/channel/options/:optionChoiceStableId')
  @UberAdminWrite()
  async upsertOptionChannelConfig(
    @Param('optionChoiceStableId', ResourceIdPipe) optionChoiceStableId: string,
    @Body() dto: UpsertUberOptionItemConfigDto,
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return await this.menu.upsertUberOptionItemConfig({
      storeId,
      optionChoiceStableId,
      priceDeltaCents: dto.priceDeltaCents,
      isAvailable: dto.isAvailable,
      displayName: dto.displayName,
      displayDescription: dto.displayDescription,
    });
  }

  @Get('menu/draft')
  async getMenuDraft(
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return await this.menu.getUberMenuDraft(storeId);
  }

  @Patch('menu/draft/items/:itemId')
  @UberAdminWrite()
  async patchDraftItem(
    @Param('itemId', ResourceIdPipe) itemId: string,
    @Body() dto: UpdateUberDraftItemDto,
  ) {
    return await this.menu.updateUberDraftItem(itemId, dto);
  }

  @Patch('menu/draft/groups/:groupId')
  @UberAdminWrite()
  async patchDraftGroup(
    @Param('groupId', ResourceIdPipe) groupId: string,
    @Body() dto: UpdateUberDraftGroupDto,
  ) {
    return await this.menu.updateUberDraftGroup(groupId, dto);
  }

  @Patch('menu/draft/options/:optionItemId')
  @UberAdminWrite()
  async patchDraftOption(
    @Param('optionItemId', ResourceIdPipe) optionItemId: string,
    @Body() dto: UpdateUberDraftOptionDto,
  ) {
    return await this.menu.updateUberDraftOption(optionItemId, dto);
  }

  @Post('menu/draft/options/:optionItemId/child-groups')
  @UberAdminWrite()
  async bindOptionChildGroup(
    @Param('optionItemId', ResourceIdPipe) optionItemId: string,
    @Body() dto: UpdateUberDraftOptionChildGroupDto,
  ) {
    return await this.menu.bindUberDraftOptionChildGroup(
      optionItemId,
      dto.groupId,
      dto.storeId,
    );
  }

  @Delete('menu/draft/options/:optionItemId/child-groups/:groupId')
  @UberAdminWrite()
  async unbindOptionChildGroup(
    @Param('optionItemId', ResourceIdPipe) optionItemId: string,
    @Param('groupId', ResourceIdPipe) groupId: string,
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return await this.menu.unbindUberDraftOptionChildGroup(
      optionItemId,
      groupId,
      storeId,
    );
  }

  @Get('menu/draft/diff')
  async getMenuDraftDiff(
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return await this.menu.getUberMenuDraftDiff(storeId);
  }

  @Post('menu/publish')
  @UberMfaAdminWrite()
  async publishMenu(@Body() dto: PublishUberMenuDto) {
    return await this.menu.publishUberMenu({
      storeId: dto.storeId,
      dryRun: dto.dryRun,
      timezoneConfirmed: dto.timezoneConfirmed,
      taxRateConfirmed: dto.taxRateConfirmed,
      excludedCategoryIds: dto.excludedCategoryIds,
      excludedGroupIds: dto.excludedGroupIds,
      excludedMenuItemStableIds: dto.excludedMenuItemStableIds,
      excludedOptionChoiceStableIds: dto.excludedOptionChoiceStableIds,
    });
  }

  @Post('menu/items/:menuItemStableId/availability')
  @UberMfaAdminWrite()
  async syncMenuItemAvailability(
    @Param('menuItemStableId', ResourceIdPipe) menuItemStableId: string,
    @Body() dto: SyncUberMenuItemAvailabilityDto,
  ) {
    return await this.menu.syncUberMenuItemAvailability({
      menuItemStableId,
      isAvailable: dto.isAvailable,
      storeId: dto.storeId,
    });
  }

  @Post('menu/options/:optionChoiceStableId/availability')
  @UberMfaAdminWrite()
  async syncOptionItemAvailability(
    @Param('optionChoiceStableId', ResourceIdPipe) optionChoiceStableId: string,
    @Body() dto: SyncUberOptionItemAvailabilityDto,
  ) {
    return await this.menu.syncUberOptionItemAvailability({
      optionChoiceStableId,
      isAvailable: dto.isAvailable,
      storeId: dto.storeId,
    });
  }
}
