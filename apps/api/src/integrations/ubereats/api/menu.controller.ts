import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { UberEatsExceptionFilter } from './ubereats-exception.filter';

import {
  OptionalResourceIdPipe,
  ResourceIdPipe,
} from '../contracts/requests/resource-id.pipe';
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
} from '../contracts/requests/ubereats.requests';
import { UberMenuDraftService } from '../application/menu/uber-menu-draft.service';
import { UberMenuPublishService } from '../application/menu/uber-menu-publish.service';
import { UberMenuAvailabilityService } from '../application/menu/uber-menu-availability.service';
import {
  presentMenuDraft,
  presentMenuDiff,
  presentMenuList,
  presentMenuMutation,
} from './menu.presenter';

@Controller('integrations/ubereats')
@UseFilters(UberEatsExceptionFilter)
@UberReadOnlyAdmin()
export class UberEatsMenuController {
  constructor(
    private readonly drafts: UberMenuDraftService,
    private readonly publications: UberMenuPublishService,
    private readonly availability: UberMenuAvailabilityService,
  ) {}
  @Get('menu/channel/items')
  async listItemChannelConfigs(
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return presentMenuList(
      await this.drafts.listUberItemChannelConfigs(storeId),
      500,
    );
  }

  @Get('menu/published/items')
  async listPublishedMenuItems(
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return presentMenuList(
      await this.drafts.listUberPublishedMenuItems(storeId),
      1000,
    );
  }

  @Post('menu/channel/items/:menuItemStableId')
  @UberAdminWrite()
  async upsertItemChannelConfig(
    @Param('menuItemStableId', ResourceIdPipe) menuItemStableId: string,
    @Body() dto: UpsertUberPriceBookItemDto,
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    await this.drafts.upsertUberItemChannelConfig({
      storeId,
      menuItemStableId,
      priceCents: dto.priceCents,
      isAvailable: dto.isAvailable,
      displayName: dto.displayName,
      displayDescription: dto.displayDescription,
    });
    return presentMenuMutation();
  }

  @Get('menu/channel/options')
  async listOptionChannelConfigs(
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return presentMenuList(
      await this.drafts.listUberOptionItemConfigs(storeId),
      1000,
    );
  }

  @Post('menu/channel/options/:optionChoiceStableId')
  @UberAdminWrite()
  async upsertOptionChannelConfig(
    @Param('optionChoiceStableId', ResourceIdPipe) optionChoiceStableId: string,
    @Body() dto: UpsertUberOptionItemConfigDto,
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    await this.drafts.upsertUberOptionItemConfig({
      storeId,
      optionChoiceStableId,
      priceDeltaCents: dto.priceDeltaCents,
      isAvailable: dto.isAvailable,
      displayName: dto.displayName,
      displayDescription: dto.displayDescription,
    });
    return presentMenuMutation();
  }

  @Get('menu/draft')
  async getMenuDraft(
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return presentMenuDraft(await this.drafts.getUberMenuDraft(storeId));
  }

  @Patch('menu/draft/items/:itemId')
  @UberAdminWrite()
  async patchDraftItem(
    @Param('itemId', ResourceIdPipe) itemId: string,
    @Body() dto: UpdateUberDraftItemDto,
  ) {
    await this.drafts.updateUberDraftItem(itemId, dto);
    return presentMenuMutation();
  }

  @Patch('menu/draft/groups/:groupId')
  @UberAdminWrite()
  async patchDraftGroup(
    @Param('groupId', ResourceIdPipe) groupId: string,
    @Body() dto: UpdateUberDraftGroupDto,
  ) {
    await this.drafts.updateUberDraftGroup(groupId, dto);
    return presentMenuMutation();
  }

  @Patch('menu/draft/options/:optionItemId')
  @UberAdminWrite()
  async patchDraftOption(
    @Param('optionItemId', ResourceIdPipe) optionItemId: string,
    @Body() dto: UpdateUberDraftOptionDto,
  ) {
    await this.drafts.updateUberDraftOption(optionItemId, dto);
    return presentMenuMutation();
  }

  @Post('menu/draft/options/:optionItemId/child-groups')
  @UberAdminWrite()
  async bindOptionChildGroup(
    @Param('optionItemId', ResourceIdPipe) optionItemId: string,
    @Body() dto: UpdateUberDraftOptionChildGroupDto,
  ) {
    await this.drafts.bindUberDraftOptionChildGroup(
      optionItemId,
      dto.groupId,
      dto.storeId,
    );
    return presentMenuMutation();
  }

  @Delete('menu/draft/options/:optionItemId/child-groups/:groupId')
  @UberAdminWrite()
  async unbindOptionChildGroup(
    @Param('optionItemId', ResourceIdPipe) optionItemId: string,
    @Param('groupId', ResourceIdPipe) groupId: string,
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    await this.drafts.unbindUberDraftOptionChildGroup(
      optionItemId,
      groupId,
      storeId,
    );
    return presentMenuMutation();
  }

  @Get('menu/draft/diff')
  async getMenuDraftDiff(
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return presentMenuDiff(await this.drafts.getUberMenuDraftDiff(storeId));
  }

  @Post('menu/publish')
  @UberMfaAdminWrite()
  async publishMenu(@Body() dto: PublishUberMenuDto) {
    await this.publications.publishUberMenu({
      storeId: dto.storeId,
      dryRun: dto.dryRun,
      timezoneConfirmed: dto.timezoneConfirmed,
      taxRateConfirmed: dto.taxRateConfirmed,
      excludedCategoryIds: dto.excludedCategoryIds,
      excludedGroupIds: dto.excludedGroupIds,
      excludedMenuItemStableIds: dto.excludedMenuItemStableIds,
      excludedOptionChoiceStableIds: dto.excludedOptionChoiceStableIds,
    });
    return presentMenuMutation();
  }

  @Post('menu/items/:menuItemStableId/availability')
  @UberMfaAdminWrite()
  async syncMenuItemAvailability(
    @Param('menuItemStableId', ResourceIdPipe) menuItemStableId: string,
    @Body() dto: SyncUberMenuItemAvailabilityDto,
  ) {
    await this.availability.syncUberMenuItemAvailability({
      menuItemStableId,
      isAvailable: dto.isAvailable,
      storeId: dto.storeId,
    });
    return presentMenuMutation();
  }

  @Post('menu/options/:optionChoiceStableId/availability')
  @UberMfaAdminWrite()
  async syncOptionItemAvailability(
    @Param('optionChoiceStableId', ResourceIdPipe) optionChoiceStableId: string,
    @Body() dto: SyncUberOptionItemAvailabilityDto,
  ) {
    await this.availability.syncUberOptionItemAvailability({
      optionChoiceStableId,
      isAvailable: dto.isAvailable,
      storeId: dto.storeId,
    });
    return presentMenuMutation();
  }
}
