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
} from './pipes/resource-id.pipe';
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
import { QueryUberMenuConfigUseCase } from '../application/menu/query-uber-menu-config.use-case';
import { WriteUberMenuConfigUseCase } from '../application/menu/write-uber-menu-config.use-case';
import { ReadUberMenuDraftUseCase } from '../application/menu/read-uber-menu-draft.use-case';
import { UpdateUberMenuDraftItemUseCase } from '../application/menu/update-uber-menu-draft-item.use-case';
import { BindUberMenuOptionChildGroupUseCase } from '../application/menu/bind-uber-menu-option-child-group.use-case';
import { QueryUberMenuDraftDiffUseCase } from '../application/menu/query-uber-menu-draft-diff.use-case';
import { PublishUberMenuUseCase } from '../application/menu/publish-uber-menu.use-case';
import { UberMenuAvailabilityUseCase } from '../application/menu/uber-menu-availability.use-case';
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
    private readonly configQueries: QueryUberMenuConfigUseCase,
    private readonly configWrites: WriteUberMenuConfigUseCase,
    private readonly draftReader: ReadUberMenuDraftUseCase,
    private readonly draftUpdates: UpdateUberMenuDraftItemUseCase,
    private readonly optionGroupBindings: BindUberMenuOptionChildGroupUseCase,
    private readonly draftDiffs: QueryUberMenuDraftDiffUseCase,
    private readonly publications: PublishUberMenuUseCase,
    private readonly availability: UberMenuAvailabilityUseCase,
  ) {}
  @Get('menu/channel/items')
  async listItemChannelConfigs(
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return presentMenuList(
      await this.configQueries.listItemChannelConfigs(storeId),
      500,
    );
  }

  @Get('menu/published/items')
  async listPublishedMenuItems(
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return presentMenuList(
      await this.configQueries.listPublishedMenuItems(storeId),
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
    await this.configWrites.upsertItemChannelConfig({
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
      await this.configQueries.listOptionItemConfigs(storeId),
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
    await this.configWrites.upsertOptionItemConfig({
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
    return presentMenuDraft(await this.draftReader.execute(storeId));
  }

  @Patch('menu/draft/items/:itemId')
  @UberAdminWrite()
  async patchDraftItem(
    @Param('itemId', ResourceIdPipe) itemId: string,
    @Body() dto: UpdateUberDraftItemDto,
  ) {
    await this.draftUpdates.updateItem(itemId, dto);
    return presentMenuMutation();
  }

  @Patch('menu/draft/groups/:groupId')
  @UberAdminWrite()
  async patchDraftGroup(
    @Param('groupId', ResourceIdPipe) groupId: string,
    @Body() dto: UpdateUberDraftGroupDto,
  ) {
    await this.draftUpdates.updateGroup(groupId, dto);
    return presentMenuMutation();
  }

  @Patch('menu/draft/options/:optionItemId')
  @UberAdminWrite()
  async patchDraftOption(
    @Param('optionItemId', ResourceIdPipe) optionItemId: string,
    @Body() dto: UpdateUberDraftOptionDto,
  ) {
    await this.draftUpdates.updateOption(optionItemId, dto);
    return presentMenuMutation();
  }

  @Post('menu/draft/options/:optionItemId/child-groups')
  @UberAdminWrite()
  async bindOptionChildGroup(
    @Param('optionItemId', ResourceIdPipe) optionItemId: string,
    @Body() dto: UpdateUberDraftOptionChildGroupDto,
  ) {
    await this.optionGroupBindings.bind(optionItemId, dto.groupId, dto.storeId);
    return presentMenuMutation();
  }

  @Delete('menu/draft/options/:optionItemId/child-groups/:groupId')
  @UberAdminWrite()
  async unbindOptionChildGroup(
    @Param('optionItemId', ResourceIdPipe) optionItemId: string,
    @Param('groupId', ResourceIdPipe) groupId: string,
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    await this.optionGroupBindings.unbind(optionItemId, groupId, storeId);
    return presentMenuMutation();
  }

  @Get('menu/draft/diff')
  async getMenuDraftDiff(
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    return presentMenuDiff(await this.draftDiffs.execute(storeId));
  }

  @Post('menu/publish')
  @UberMfaAdminWrite()
  async publishMenu(@Body() dto: PublishUberMenuDto) {
    await this.publications.execute({
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
