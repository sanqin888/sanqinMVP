import { Injectable } from '@nestjs/common';
import { UberMenuWorkflowCore } from './uber-menu.workflow';

/** Owns draft editing, graph preview, channel configuration and diff use cases. */
@Injectable()
export class UberMenuDraftService {
  constructor(private readonly workflow: UberMenuWorkflowCore) {}

  listUberItemChannelConfigs(
    ...args: Parameters<UberMenuWorkflowCore['listUberItemChannelConfigs']>
  ) {
    return this.workflow.listUberItemChannelConfigs(...args);
  }
  listUberPublishedMenuItems(
    ...args: Parameters<UberMenuWorkflowCore['listUberPublishedMenuItems']>
  ) {
    return this.workflow.listUberPublishedMenuItems(...args);
  }
  listUberOptionItemConfigs(
    ...args: Parameters<UberMenuWorkflowCore['listUberOptionItemConfigs']>
  ) {
    return this.workflow.listUberOptionItemConfigs(...args);
  }
  upsertUberItemChannelConfig(
    ...args: Parameters<UberMenuWorkflowCore['upsertUberItemChannelConfig']>
  ) {
    return this.workflow.upsertUberItemChannelConfig(...args);
  }
  upsertUberOptionItemConfig(
    ...args: Parameters<UberMenuWorkflowCore['upsertUberOptionItemConfig']>
  ) {
    return this.workflow.upsertUberOptionItemConfig(...args);
  }
  getUberMenuDraft(
    ...args: Parameters<UberMenuWorkflowCore['getUberMenuDraft']>
  ) {
    return this.workflow.getUberMenuDraft(...args);
  }
  updateUberDraftItem(
    ...args: Parameters<UberMenuWorkflowCore['updateUberDraftItem']>
  ) {
    return this.workflow.updateUberDraftItem(...args);
  }
  updateUberDraftGroup(
    ...args: Parameters<UberMenuWorkflowCore['updateUberDraftGroup']>
  ) {
    return this.workflow.updateUberDraftGroup(...args);
  }
  updateUberDraftOption(
    ...args: Parameters<UberMenuWorkflowCore['updateUberDraftOption']>
  ) {
    return this.workflow.updateUberDraftOption(...args);
  }
  bindUberDraftOptionChildGroup(
    ...args: Parameters<UberMenuWorkflowCore['bindUberDraftOptionChildGroup']>
  ) {
    return this.workflow.bindUberDraftOptionChildGroup(...args);
  }
  unbindUberDraftOptionChildGroup(
    ...args: Parameters<UberMenuWorkflowCore['unbindUberDraftOptionChildGroup']>
  ) {
    return this.workflow.unbindUberDraftOptionChildGroup(...args);
  }
  getUberMenuDraftDiff(
    ...args: Parameters<UberMenuWorkflowCore['getUberMenuDraftDiff']>
  ) {
    return this.workflow.getUberMenuDraftDiff(...args);
  }
}
