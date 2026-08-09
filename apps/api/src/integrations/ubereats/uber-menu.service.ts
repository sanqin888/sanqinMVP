import { Injectable } from '@nestjs/common';
import { UberEatsService } from './ubereats.service';

/** Menu graph, validation, publication and availability boundary. */
@Injectable()
export class UberMenuService {
  constructor(private readonly facade: UberEatsService) {}

  listUberItemChannelConfigs(
    ...args: Parameters<UberEatsService['listUberItemChannelConfigs']>
  ) {
    return this.facade.listUberItemChannelConfigs(...args);
  }
  listUberPublishedMenuItems(
    ...args: Parameters<UberEatsService['listUberPublishedMenuItems']>
  ) {
    return this.facade.listUberPublishedMenuItems(...args);
  }
  listUberOptionItemConfigs(
    ...args: Parameters<UberEatsService['listUberOptionItemConfigs']>
  ) {
    return this.facade.listUberOptionItemConfigs(...args);
  }
  upsertUberItemChannelConfig(
    ...args: Parameters<UberEatsService['upsertUberItemChannelConfig']>
  ) {
    return this.facade.upsertUberItemChannelConfig(...args);
  }
  upsertUberOptionItemConfig(
    ...args: Parameters<UberEatsService['upsertUberOptionItemConfig']>
  ) {
    return this.facade.upsertUberOptionItemConfig(...args);
  }
  getUberMenuDraft(...args: Parameters<UberEatsService['getUberMenuDraft']>) {
    return this.facade.getUberMenuDraft(...args);
  }
  updateUberDraftItem(
    ...args: Parameters<UberEatsService['updateUberDraftItem']>
  ) {
    return this.facade.updateUberDraftItem(...args);
  }
  updateUberDraftGroup(
    ...args: Parameters<UberEatsService['updateUberDraftGroup']>
  ) {
    return this.facade.updateUberDraftGroup(...args);
  }
  updateUberDraftOption(
    ...args: Parameters<UberEatsService['updateUberDraftOption']>
  ) {
    return this.facade.updateUberDraftOption(...args);
  }
  bindUberDraftOptionChildGroup(
    ...args: Parameters<UberEatsService['bindUberDraftOptionChildGroup']>
  ) {
    return this.facade.bindUberDraftOptionChildGroup(...args);
  }
  unbindUberDraftOptionChildGroup(
    ...args: Parameters<UberEatsService['unbindUberDraftOptionChildGroup']>
  ) {
    return this.facade.unbindUberDraftOptionChildGroup(...args);
  }
  getUberMenuDraftDiff(
    ...args: Parameters<UberEatsService['getUberMenuDraftDiff']>
  ) {
    return this.facade.getUberMenuDraftDiff(...args);
  }
  publishUberMenu(...args: Parameters<UberEatsService['publishUberMenu']>) {
    return this.facade.publishUberMenu(...args);
  }
  syncUberMenuItemAvailability(
    ...args: Parameters<UberEatsService['syncUberMenuItemAvailability']>
  ) {
    return this.facade.syncUberMenuItemAvailability(...args);
  }
  syncUberOptionItemAvailability(
    ...args: Parameters<UberEatsService['syncUberOptionItemAvailability']>
  ) {
    return this.facade.syncUberOptionItemAvailability(...args);
  }
  validateUberMenuPayload(
    ...args: Parameters<UberEatsService['validateUberMenuPayload']>
  ) {
    return this.facade.validateUberMenuPayload(...args);
  }
}
