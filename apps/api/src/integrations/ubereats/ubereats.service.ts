import { Injectable } from '@nestjs/common';
export * from './uber-payload.utils';

import { UberWebhookService } from './uber-webhook.service';
import { UberOrderService } from './uber-order.service';
import { UberMenuService } from './uber-menu.service';
import { UberMerchantService } from './uber-merchant.service';
import { UberOperationsService } from './uber-operations.service';

/**
 * Backwards-compatible integration facade.
 *
 * Controllers continue to depend on this class while all implementation work is
 * owned by the focused providers below. Keep this class delegation-only.
 */
@Injectable()
export class UberEatsService {
  constructor(
    private readonly webhook: UberWebhookService,
    private readonly orders: UberOrderService,
    private readonly menu: UberMenuService,
    private readonly merchant: UberMerchantService,
    private readonly operations: UberOperationsService,
  ) {}

  buildMerchantAuthorizeUrl(
    ...args: Parameters<UberMerchantService['buildMerchantAuthorizeUrl']>
  ) {
    return this.merchant.buildMerchantAuthorizeUrl(...args);
  }
  startMerchantOAuth(
    ...args: Parameters<UberMerchantService['startMerchantOAuth']>
  ) {
    return this.merchant.startMerchantOAuth(...args);
  }
  exchangeAuthorizationCode(
    ...args: Parameters<UberMerchantService['exchangeAuthorizationCode']>
  ) {
    return this.merchant.exchangeAuthorizationCode(...args);
  }
  getMerchantStores(
    ...args: Parameters<UberMerchantService['getMerchantStores']>
  ) {
    return this.merchant.getMerchantStores(...args);
  }
  updatePosExternalStoreId(
    ...args: Parameters<UberMerchantService['updatePosExternalStoreId']>
  ) {
    return this.merchant.updatePosExternalStoreId(...args);
  }
  getMerchantConnectionStatus(
    ...args: Parameters<UberMerchantService['getMerchantConnectionStatus']>
  ) {
    return this.merchant.getMerchantConnectionStatus(...args);
  }
  provisionStore(...args: Parameters<UberMerchantService['provisionStore']>) {
    return this.merchant.provisionStore(...args);
  }
  revokeOrDeprovisionStore(
    ...args: Parameters<UberMerchantService['revokeOrDeprovisionStore']>
  ) {
    return this.merchant.revokeOrDeprovisionStore(...args);
  }
  syncStoreStatusToUber(
    ...args: Parameters<UberMerchantService['syncStoreStatusToUber']>
  ) {
    return this.merchant.syncStoreStatusToUber(...args);
  }

  handleWebhook(...args: Parameters<UberWebhookService['handleWebhook']>) {
    return this.webhook.handleWebhook(...args);
  }

  syncOrderStatusToUber(
    ...args: Parameters<UberOrderService['syncOrderStatusToUber']>
  ) {
    return this.orders.syncOrderStatusToUber(...args);
  }
  getReadyForPickupAction(
    ...args: Parameters<UberOrderService['getReadyForPickupAction']>
  ) {
    return this.orders.getReadyForPickupAction(...args);
  }
  retryReadyForPickup(
    ...args: Parameters<UberOrderService['retryReadyForPickup']>
  ) {
    return this.orders.retryReadyForPickup(...args);
  }
  processPendingUberOrderActions(
    ...args: Parameters<UberOrderService['processPendingUberOrderActions']>
  ) {
    return this.orders.processPendingUberOrderActions(...args);
  }
  acceptUberOrder(...args: Parameters<UberOrderService['acceptUberOrder']>) {
    return this.orders.acceptUberOrder(...args);
  }
  denyUberOrder(...args: Parameters<UberOrderService['denyUberOrder']>) {
    return this.orders.denyUberOrder(...args);
  }
  listPendingUberOrders(
    ...args: Parameters<UberOrderService['listPendingUberOrders']>
  ) {
    return this.orders.listPendingUberOrders(...args);
  }

  listUberItemChannelConfigs(
    ...args: Parameters<UberMenuService['listUberItemChannelConfigs']>
  ) {
    return this.menu.listUberItemChannelConfigs(...args);
  }
  listUberPublishedMenuItems(
    ...args: Parameters<UberMenuService['listUberPublishedMenuItems']>
  ) {
    return this.menu.listUberPublishedMenuItems(...args);
  }
  listUberOptionItemConfigs(
    ...args: Parameters<UberMenuService['listUberOptionItemConfigs']>
  ) {
    return this.menu.listUberOptionItemConfigs(...args);
  }
  upsertUberItemChannelConfig(
    ...args: Parameters<UberMenuService['upsertUberItemChannelConfig']>
  ) {
    return this.menu.upsertUberItemChannelConfig(...args);
  }
  upsertUberOptionItemConfig(
    ...args: Parameters<UberMenuService['upsertUberOptionItemConfig']>
  ) {
    return this.menu.upsertUberOptionItemConfig(...args);
  }
  getUberMenuDraft(...args: Parameters<UberMenuService['getUberMenuDraft']>) {
    return this.menu.getUberMenuDraft(...args);
  }
  updateUberDraftItem(
    ...args: Parameters<UberMenuService['updateUberDraftItem']>
  ) {
    return this.menu.updateUberDraftItem(...args);
  }
  updateUberDraftGroup(
    ...args: Parameters<UberMenuService['updateUberDraftGroup']>
  ) {
    return this.menu.updateUberDraftGroup(...args);
  }
  updateUberDraftOption(
    ...args: Parameters<UberMenuService['updateUberDraftOption']>
  ) {
    return this.menu.updateUberDraftOption(...args);
  }
  bindUberDraftOptionChildGroup(
    ...args: Parameters<UberMenuService['bindUberDraftOptionChildGroup']>
  ) {
    return this.menu.bindUberDraftOptionChildGroup(...args);
  }
  unbindUberDraftOptionChildGroup(
    ...args: Parameters<UberMenuService['unbindUberDraftOptionChildGroup']>
  ) {
    return this.menu.unbindUberDraftOptionChildGroup(...args);
  }
  getUberMenuDraftDiff(
    ...args: Parameters<UberMenuService['getUberMenuDraftDiff']>
  ) {
    return this.menu.getUberMenuDraftDiff(...args);
  }
  publishUberMenu(...args: Parameters<UberMenuService['publishUberMenu']>) {
    return this.menu.publishUberMenu(...args);
  }
  syncUberMenuItemAvailability(
    ...args: Parameters<UberMenuService['syncUberMenuItemAvailability']>
  ) {
    return this.menu.syncUberMenuItemAvailability(...args);
  }
  syncUberOptionItemAvailability(
    ...args: Parameters<UberMenuService['syncUberOptionItemAvailability']>
  ) {
    return this.menu.syncUberOptionItemAvailability(...args);
  }
  validateUberMenuPayload(
    ...args: Parameters<UberMenuService['validateUberMenuPayload']>
  ) {
    return this.menu.validateUberMenuPayload(...args);
  }

  generateReconciliationReport(
    ...args: Parameters<UberOperationsService['generateReconciliationReport']>
  ) {
    return this.operations.generateReconciliationReport(...args);
  }
  listReconciliationReports(
    ...args: Parameters<UberOperationsService['listReconciliationReports']>
  ) {
    return this.operations.listReconciliationReports(...args);
  }
  createOpsTicket(
    ...args: Parameters<UberOperationsService['createOpsTicket']>
  ) {
    return this.operations.createOpsTicket(...args);
  }
  listOpsTickets(...args: Parameters<UberOperationsService['listOpsTickets']>) {
    return this.operations.listOpsTickets(...args);
  }
  retryOpsTicket(...args: Parameters<UberOperationsService['retryOpsTicket']>) {
    return this.operations.retryOpsTicket(...args);
  }
}
