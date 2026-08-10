import { Inject, Injectable } from '@nestjs/common';
import {
  UBER_MENU_DRAFT_PORT,
  type UberMenuDraftPort,
} from '../ports/uber-use-case.ports';

/** Draft read/write and diff use cases. Every write is committed by the port in one transaction. */
@Injectable()
export class UberMenuDraftService {
  constructor(
    @Inject(UBER_MENU_DRAFT_PORT) private readonly drafts: UberMenuDraftPort,
  ) {}
  listUberItemChannelConfigs(storeId?: string) {
    return this.drafts.listUberItemChannelConfigs(storeId);
  }
  listUberPublishedMenuItems(storeId?: string) {
    return this.drafts.listUberPublishedMenuItems(storeId);
  }
  listUberOptionItemConfigs(storeId?: string) {
    return this.drafts.listUberOptionItemConfigs(storeId);
  }
  upsertUberItemChannelConfig(
    input: Parameters<UberMenuDraftPort['upsertUberItemChannelConfig']>[0],
  ) {
    return this.drafts.upsertUberItemChannelConfig(input);
  }
  upsertUberOptionItemConfig(
    input: Parameters<UberMenuDraftPort['upsertUberOptionItemConfig']>[0],
  ) {
    return this.drafts.upsertUberOptionItemConfig(input);
  }
  getUberMenuDraft(storeId?: string) {
    return this.drafts.getUberMenuDraft(storeId);
  }
  updateUberDraftItem(
    ...args: Parameters<UberMenuDraftPort['updateUberDraftItem']>
  ) {
    return this.drafts.updateUberDraftItem(...args);
  }
  updateUberDraftGroup(
    ...args: Parameters<UberMenuDraftPort['updateUberDraftGroup']>
  ) {
    return this.drafts.updateUberDraftGroup(...args);
  }
  updateUberDraftOption(
    ...args: Parameters<UberMenuDraftPort['updateUberDraftOption']>
  ) {
    return this.drafts.updateUberDraftOption(...args);
  }
  bindUberDraftOptionChildGroup(
    ...args: Parameters<UberMenuDraftPort['bindUberDraftOptionChildGroup']>
  ) {
    return this.drafts.bindUberDraftOptionChildGroup(...args);
  }
  unbindUberDraftOptionChildGroup(
    ...args: Parameters<UberMenuDraftPort['unbindUberDraftOptionChildGroup']>
  ) {
    return this.drafts.unbindUberDraftOptionChildGroup(...args);
  }
  getUberMenuDraftDiff(storeId?: string) {
    return this.drafts.getUberMenuDraftDiff(storeId);
  }
}
