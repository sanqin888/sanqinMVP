import { Injectable } from '@nestjs/common';
import type { UberMenuUploadPayload } from './uber-menu.types';
import { UberMenuAvailabilityService } from './uber-menu-availability.service';
import { UberMenuDraftService } from './uber-menu-draft.service';
import { validateUberMenuPayload } from './uber-menu.payload';
import { UberMenuPublishService } from './uber-menu-publish.service';

/** Public API-compatible facade. Domain services own the individual use cases. */
@Injectable()
export class UberMenuService {
  constructor(
    private readonly drafts: UberMenuDraftService,
    private readonly publishing: UberMenuPublishService,
    private readonly availability: UberMenuAvailabilityService,
  ) {}

  listUberItemChannelConfigs(
    ...args: Parameters<UberMenuDraftService['listUberItemChannelConfigs']>
  ) {
    return this.drafts.listUberItemChannelConfigs(...args);
  }
  listUberPublishedMenuItems(
    ...args: Parameters<UberMenuDraftService['listUberPublishedMenuItems']>
  ) {
    return this.drafts.listUberPublishedMenuItems(...args);
  }
  listUberOptionItemConfigs(
    ...args: Parameters<UberMenuDraftService['listUberOptionItemConfigs']>
  ) {
    return this.drafts.listUberOptionItemConfigs(...args);
  }
  upsertUberItemChannelConfig(
    ...args: Parameters<UberMenuDraftService['upsertUberItemChannelConfig']>
  ) {
    return this.drafts.upsertUberItemChannelConfig(...args);
  }
  upsertUberOptionItemConfig(
    ...args: Parameters<UberMenuDraftService['upsertUberOptionItemConfig']>
  ) {
    return this.drafts.upsertUberOptionItemConfig(...args);
  }
  getUberMenuDraft(
    ...args: Parameters<UberMenuDraftService['getUberMenuDraft']>
  ) {
    return this.drafts.getUberMenuDraft(...args);
  }
  updateUberDraftItem(
    ...args: Parameters<UberMenuDraftService['updateUberDraftItem']>
  ) {
    return this.drafts.updateUberDraftItem(...args);
  }
  updateUberDraftGroup(
    ...args: Parameters<UberMenuDraftService['updateUberDraftGroup']>
  ) {
    return this.drafts.updateUberDraftGroup(...args);
  }
  updateUberDraftOption(
    ...args: Parameters<UberMenuDraftService['updateUberDraftOption']>
  ) {
    return this.drafts.updateUberDraftOption(...args);
  }
  bindUberDraftOptionChildGroup(
    ...args: Parameters<UberMenuDraftService['bindUberDraftOptionChildGroup']>
  ) {
    return this.drafts.bindUberDraftOptionChildGroup(...args);
  }
  unbindUberDraftOptionChildGroup(
    ...args: Parameters<UberMenuDraftService['unbindUberDraftOptionChildGroup']>
  ) {
    return this.drafts.unbindUberDraftOptionChildGroup(...args);
  }
  getUberMenuDraftDiff(
    ...args: Parameters<UberMenuDraftService['getUberMenuDraftDiff']>
  ) {
    return this.drafts.getUberMenuDraftDiff(...args);
  }
  publishUberMenu(
    ...args: Parameters<UberMenuPublishService['publishUberMenu']>
  ) {
    return this.publishing.publishUberMenu(...args);
  }
  processWebhookEvent(
    ...args: Parameters<UberMenuPublishService['processWebhookEvent']>
  ) {
    return this.publishing.processWebhookEvent(...args);
  }
  syncUberMenuItemAvailability(
    ...args: Parameters<
      UberMenuAvailabilityService['syncUberMenuItemAvailability']
    >
  ) {
    return this.availability.syncUberMenuItemAvailability(...args);
  }
  syncUberOptionItemAvailability(
    ...args: Parameters<
      UberMenuAvailabilityService['syncUberOptionItemAvailability']
    >
  ) {
    return this.availability.syncUberOptionItemAvailability(...args);
  }
  validateUberMenuPayload(payload: UberMenuUploadPayload) {
    return validateUberMenuPayload(payload);
  }
}
