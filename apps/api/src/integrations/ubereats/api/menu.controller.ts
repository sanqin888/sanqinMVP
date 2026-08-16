import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Query,
  Req,
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
  UberMenuConfigImportDto,
  SyncUberMenuItemAvailabilityDto,
  SyncUberOptionItemAvailabilityDto,
  UpdateUberDraftGroupDto,
  UpdateUberDraftItemDto,
  UpdateUberDraftOptionDto,
  UpsertUberOptionItemConfigDto,
  UpsertUberPriceBookItemDto,
} from '../contracts/requests/menu.requests';
import { QueryUberMenuConfigUseCase } from '../application/menu/query-uber-menu-config.use-case';
import { UpsertUberItemChannelConfigUseCase } from '../application/menu/upsert-uber-item-channel-config.use-case';
import { UpsertUberOptionItemConfigUseCase } from '../application/menu/upsert-uber-option-item-config.use-case';
import { ReadUberMenuDraftUseCase } from '../application/menu/read-uber-menu-draft.use-case';
import { UpdateUberDraftItemUseCase } from '../application/menu/update-uber-draft-item.use-case';
import { UpdateUberDraftGroupUseCase } from '../application/menu/update-uber-draft-group.use-case';
import { UpdateUberDraftOptionUseCase } from '../application/menu/update-uber-draft-option.use-case';
import { QueryUberMenuDraftDiffUseCase } from '../application/menu/query-uber-menu-draft-diff.use-case';
import { PublishUberMenuUseCase } from '../application/menu/publish-uber-menu.use-case';
import { UberMenuAvailabilityUseCase } from '../application/menu/uber-menu-availability.use-case';
import { UberMenuConfigImportUseCase } from '../application/menu/uber-menu-config-import.use-case';
import {
  presentMenuDraft,
  presentMenuDiff,
  presentMenuList,
  presentMenuMutation,
  presentMenuOperation,
} from './menu.presenter';

@Controller('integrations/ubereats')
@UseFilters(UberEatsExceptionFilter)
@UberReadOnlyAdmin()
export class UberEatsMenuController {
  constructor(
    private readonly configQueries: QueryUberMenuConfigUseCase,
    private readonly itemConfigUpserts: UpsertUberItemChannelConfigUseCase,
    private readonly optionConfigUpserts: UpsertUberOptionItemConfigUseCase,
    private readonly draftReader: ReadUberMenuDraftUseCase,
    private readonly draftItemUpdates: UpdateUberDraftItemUseCase,
    private readonly draftGroupUpdates: UpdateUberDraftGroupUseCase,
    private readonly draftOptionUpdates: UpdateUberDraftOptionUseCase,
    private readonly draftDiffs: QueryUberMenuDraftDiffUseCase,
    private readonly publications: PublishUberMenuUseCase,
    private readonly availability: UberMenuAvailabilityUseCase,
    private readonly configImports: UberMenuConfigImportUseCase,
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

  @Post('menu/channel/items/:stableId')
  @UberAdminWrite()
  async upsertItemChannelConfig(
    @Param('stableId', ResourceIdPipe) stableId: string,
    @Body() dto: UpsertUberPriceBookItemDto,
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    await this.itemConfigUpserts.execute({
      storeId,
      menuItemStableId: stableId,
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

  @Post('menu/channel/options/:stableId')
  @UberAdminWrite()
  async upsertOptionChannelConfig(
    @Param('stableId', ResourceIdPipe) stableId: string,
    @Body() dto: UpsertUberOptionItemConfigDto,
    @Query('storeId', OptionalResourceIdPipe) storeId?: string,
  ) {
    await this.optionConfigUpserts.execute({
      storeId,
      optionChoiceStableId: stableId,
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

  @Patch('menu/draft/items/:stableId')
  @UberAdminWrite()
  async patchDraftItem(
    @Param('stableId', ResourceIdPipe) stableId: string,
    @Body() dto: UpdateUberDraftItemDto,
  ) {
    await this.draftItemUpdates.execute(stableId, dto);
    return presentMenuMutation();
  }

  @Patch('menu/draft/groups/:stableId')
  @UberAdminWrite()
  async patchDraftGroup(
    @Param('stableId', ResourceIdPipe) stableId: string,
    @Body() dto: UpdateUberDraftGroupDto,
  ) {
    await this.draftGroupUpdates.execute(stableId, dto);
    return presentMenuMutation();
  }

  @Patch('menu/draft/options/:stableId')
  @UberAdminWrite()
  async patchDraftOption(
    @Param('stableId', ResourceIdPipe) stableId: string,
    @Body() dto: UpdateUberDraftOptionDto,
  ) {
    await this.draftOptionUpdates.execute(stableId, dto);
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
    const result = await this.publications.execute({
      storeId: dto.storeId,
      dryRun: dto.dryRun,
      timezoneConfirmed: dto.timezoneConfirmed,
      taxRateConfirmed: dto.taxRateConfirmed,
      safetyFingerprint: dto.safetyFingerprint,
      excludedCategoryIds: dto.excludedCategoryIds,
      excludedGroupIds: dto.excludedGroupIds,
      excludedMenuItemStableIds: dto.excludedMenuItemStableIds,
      excludedOptionChoiceStableIds: dto.excludedOptionChoiceStableIds,
    });
    return presentMenuOperation(result);
  }

  @Post('menu/config-import/preview')
  @UberAdminWrite()
  async previewConfigImport(@Body() dto: UberMenuConfigImportDto) {
    const result = await this.configImports.preview(
      dto.sourceStoreId,
      dto.targetStoreId,
      dto.mode,
    );
    return presentMenuOperation(result);
  }

  @Post('menu/config-import/apply')
  @UberMfaAdminWrite()
  async applyConfigImport(
    @Body() dto: UberMenuConfigImportDto,
    @Req() req: { user?: { id?: string } },
  ) {
    const result = await this.configImports.apply(
      dto.sourceStoreId,
      dto.targetStoreId,
      dto.mode ?? 'SKIP_EXISTING',
      dto.previewFingerprint ?? '',
      req.user!.id!,
    );
    return presentMenuOperation(result);
  }

  @Post('menu/draft/items/:stableId/restore-source-price')
  @UberMfaAdminWrite()
  async restoreSourcePrice(
    @Param('stableId', ResourceIdPipe) stableId: string,
    @Body() dto: { storeId: string },
    @Req() req: { user?: { id?: string } },
  ) {
    const result = await this.configImports.restoreItemPrice(
      dto.storeId,
      stableId,
      req.user!.id!,
    );
    return presentMenuOperation(result);
  }

  @Post('menu/items/:stableId/availability')
  @UberMfaAdminWrite()
  async syncMenuItemAvailability(
    @Param('stableId', ResourceIdPipe) stableId: string,
    @Body() dto: SyncUberMenuItemAvailabilityDto,
  ) {
    await this.availability.syncUberMenuItemAvailability({
      menuItemStableId: stableId,
      isAvailable: dto.isAvailable,
      storeId: dto.storeId,
    });
    return presentMenuMutation();
  }

  @Post('menu/options/:stableId/availability')
  @UberMfaAdminWrite()
  async syncOptionItemAvailability(
    @Param('stableId', ResourceIdPipe) stableId: string,
    @Body() dto: SyncUberOptionItemAvailabilityDto,
  ) {
    await this.availability.syncUberOptionItemAvailability({
      optionChoiceStableId: stableId,
      isAvailable: dto.isAvailable,
      storeId: dto.storeId,
    });
    return presentMenuMutation();
  }
}
