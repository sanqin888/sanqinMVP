import { Injectable } from '@nestjs/common';
import { UberMenuDraftService } from './uber-menu-draft.service';
import { UberMenuPublishService } from './uber-menu-publish.service';
import { UberMenuAvailabilityService } from './uber-menu-availability.service';
/** Thin API compatibility facade; business transactions live in the individual use cases. */
@Injectable()
export class UberMenuService {
  constructor(
    private readonly drafts: UberMenuDraftService,
    private readonly publications: UberMenuPublishService,
    private readonly availability: UberMenuAvailabilityService,
  ) {}
  listUberItemChannelConfigs(
    ...a: Parameters<UberMenuDraftService['listUberItemChannelConfigs']>
  ) {
    return this.drafts.listUberItemChannelConfigs(...a);
  }
  listUberPublishedMenuItems(
    ...a: Parameters<UberMenuDraftService['listUberPublishedMenuItems']>
  ) {
    return this.drafts.listUberPublishedMenuItems(...a);
  }
  listUberOptionItemConfigs(
    ...a: Parameters<UberMenuDraftService['listUberOptionItemConfigs']>
  ) {
    return this.drafts.listUberOptionItemConfigs(...a);
  }
  upsertUberItemChannelConfig(
    ...a: Parameters<UberMenuDraftService['upsertUberItemChannelConfig']>
  ) {
    return this.drafts.upsertUberItemChannelConfig(...a);
  }
  upsertUberOptionItemConfig(
    ...a: Parameters<UberMenuDraftService['upsertUberOptionItemConfig']>
  ) {
    return this.drafts.upsertUberOptionItemConfig(...a);
  }
  getUberMenuDraft(...a: Parameters<UberMenuDraftService['getUberMenuDraft']>) {
    return this.drafts.getUberMenuDraft(...a);
  }
  updateUberDraftItem(
    ...a: Parameters<UberMenuDraftService['updateUberDraftItem']>
  ) {
    return this.drafts.updateUberDraftItem(...a);
  }
  updateUberDraftGroup(
    ...a: Parameters<UberMenuDraftService['updateUberDraftGroup']>
  ) {
    return this.drafts.updateUberDraftGroup(...a);
  }
  updateUberDraftOption(
    ...a: Parameters<UberMenuDraftService['updateUberDraftOption']>
  ) {
    return this.drafts.updateUberDraftOption(...a);
  }
  bindUberDraftOptionChildGroup(
    ...a: Parameters<UberMenuDraftService['bindUberDraftOptionChildGroup']>
  ) {
    return this.drafts.bindUberDraftOptionChildGroup(...a);
  }
  unbindUberDraftOptionChildGroup(
    ...a: Parameters<UberMenuDraftService['unbindUberDraftOptionChildGroup']>
  ) {
    return this.drafts.unbindUberDraftOptionChildGroup(...a);
  }
  getUberMenuDraftDiff(
    ...a: Parameters<UberMenuDraftService['getUberMenuDraftDiff']>
  ) {
    return this.drafts.getUberMenuDraftDiff(...a);
  }
  recoverTimedOutPublications(
    ...a: Parameters<UberMenuPublishService['recoverTimedOutPublications']>
  ) {
    return this.publications.recoverTimedOutPublications(...a);
  }
  publishUberMenu(...a: Parameters<UberMenuPublishService['publishUberMenu']>) {
    return this.publications.publishUberMenu(...a);
  }
  processWebhookEvent(
    ...a: Parameters<UberMenuPublishService['processWebhookEvent']>
  ) {
    return this.publications.processWebhookEvent(...a);
  }
  syncUberMenuItemAvailability(
    ...a: Parameters<
      UberMenuAvailabilityService['syncUberMenuItemAvailability']
    >
  ) {
    return this.availability.syncUberMenuItemAvailability(...a);
  }
  syncUberOptionItemAvailability(
    ...a: Parameters<
      UberMenuAvailabilityService['syncUberOptionItemAvailability']
    >
  ) {
    return this.availability.syncUberOptionItemAvailability(...a);
  }
}
