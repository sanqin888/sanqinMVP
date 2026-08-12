import { UberValidationError } from '../shared/uber-application.error';
import { toUberEatsApplicationError } from '../shared/uber-domain-error.mapper';
import { normalizeUberStoreId } from '../../domain/shared/uber-integration.utils';
import {
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
  type CreateOpsTicketInput,
  type GenerateReconciliationReportInput,
  type MenuItemAvailabilityContext,
  type MenuPublishContext,
  type OrderStatusSyncContext,
  type StoreStatusSyncContext,
  type UberOperationsCountSummary,
  type UberOpsTicketCreated,
  type UberOpsTicketRetryResult,
  type UberPage,
  type UberOpsTicket,
  type UberReconciliationReport,
  type UberReconciliationReportResult,
} from '../../domain/operations/uber-operations.types';
import { UberOrderStatus } from '../../domain/orders/uber-order.types';
import type { UberTelemetryPort } from '../shared/uber-telemetry.port';
import type {
  UberMenuItemOperationsRepositoryPort,
  UberOperationsUnitOfWorkPort,
  UberOpsTicketRepositoryPort,
  UberOrderOperationsRepositoryPort,
  UberReconciliationRepositoryPort,
} from './uber-operations.ports';
import type { PublishUberMenuUseCase } from '../menu/publish-uber-menu.use-case';
import type { UberMenuAvailabilityUseCase } from '../menu/uber-menu-availability.use-case';
import type { SyncUberStoreStatusUseCase } from '../merchant/uber-merchant-provisioning.service';
import type { SyncUberOrderStatusUseCase } from '../orders/sync-uber-order-status.use-case';

export type CreateUberOpsTicketCommand = Omit<
  CreateOpsTicketInput,
  'context'
> & {
  targetOrderStatus?: UberOrderStatus;
  isAvailable?: boolean;
  uberStoreId?: string;
  targetStoreStatus?: 'ONLINE' | 'PAUSED';
  publish?: {
    storeId?: string;
    timezoneConfirmed?: boolean;
    taxRateConfirmed?: boolean;
    excludedCategoryIds?: string[];
    excludedGroupIds?: string[];
    excludedMenuItemStableIds?: string[];
    excludedOptionChoiceStableIds?: string[];
  };
};

const invalidOperationsInput = (message: string): UberValidationError =>
  new UberValidationError({
    code: 'UBER_OPERATIONS_INPUT_INVALID',
    message,
    operation: 'operations.validate',
  });

export const mapCreateUberOpsTicketCommand = (
  command: CreateUberOpsTicketCommand,
): CreateOpsTicketInput => {
  const base = {
    type: command.type,
    title: command.title,
    description: command.description,
    priority: command.priority,
    storeId: command.storeId,
    externalOrderId: command.externalOrderId,
    menuItemStableId: command.menuItemStableId,
  };
  switch (command.type) {
    case 'ORDER_STATUS_SYNC':
      return { ...base, context: { targetStatus: command.targetOrderStatus! } };
    case 'MENU_ITEM_AVAILABILITY':
      return { ...base, context: { isAvailable: command.isAvailable! } };
    case 'STORE_STATUS_SYNC':
      return {
        ...base,
        context: {
          uberStoreId: command.uberStoreId!,
          targetStatus: command.targetStoreStatus!,
        },
      };
    case 'MENU_PUBLISH':
      return {
        ...base,
        context: {
          publish: {
            ...command.publish,
            storeId: command.publish?.storeId ?? command.storeId!,
            dryRun: false,
          },
        },
      };
    default:
      return base;
  }
};

export class GenerateUberReconciliationReportUseCase {
  constructor(
    private readonly orders: UberOrderOperationsRepositoryPort,
    private readonly reports: UberReconciliationRepositoryPort,
    private readonly tickets: UberOpsTicketRepositoryPort,
    private readonly telemetry: UberTelemetryPort,
  ) {}
  async execute(
    input: GenerateReconciliationReportInput,
  ): Promise<UberReconciliationReportResult> {
    const storeId = normalizeUberStoreId(input.storeId);
    const range = reportRange(input.rangeStart, input.rangeEnd);
    const [orders, failedSyncEvents, discrepancyOrders] = await Promise.all([
      this.orders.reconciliationOrders(range.rangeStart, range.rangeEnd),
      this.reports.countFailedSyncEvents(range.rangeStart, range.rangeEnd),
      this.tickets.countOpen(storeId),
    ]);
    const summary = {
      totalOrders: orders.length,
      totalAmountCents: orders.reduce((sum, row) => sum + row.totalCents, 0),
      syncedOrders: orders.filter(
        (row) => row.status !== UberOrderStatus.pending,
      ).length,
      pendingOrders: orders.filter(
        (row) => row.status === UberOrderStatus.pending,
      ).length,
      failedSyncEvents,
      discrepancyOrders,
    };
    const report = await this.reports.save({
      storeId,
      ...range,
      ...summary,
      payload: {
        rangeStart: range.rangeStart.toISOString(),
        rangeEnd: range.rangeEnd.toISOString(),
        summary,
      },
    });
    await this.telemetry.captureEvent(
      'ubereats_reconciliation_report_generated',
      { storeId, reportStableId: report.reportStableId, ...summary },
    );
    return { ok: true, storeId, ...report, ...summary, ...range };
  }
}

export class CreateUberOpsTicketUseCase {
  constructor(
    private readonly tickets: UberOpsTicketRepositoryPort,
    private readonly orders: UberOrderOperationsRepositoryPort,
    private readonly menuItems: UberMenuItemOperationsRepositoryPort,
    private readonly telemetry: UberTelemetryPort,
  ) {}
  async execute(
    command: CreateUberOpsTicketCommand,
  ): Promise<UberOpsTicketCreated> {
    const input = mapCreateUberOpsTicketCommand(command);
    const storeId = normalizeUberStoreId(input.storeId);
    const context = parseTicketContext(input.type, input.context);
    if (
      input.externalOrderId &&
      !(await this.orders.exists(input.externalOrderId))
    )
      throw invalidOperationsInput(`Uber 订单 ${input.externalOrderId} 不存在`);
    if (
      input.menuItemStableId &&
      !(await this.menuItems.exists(input.menuItemStableId))
    )
      throw invalidOperationsInput(`菜单项 ${input.menuItemStableId} 不存在`);
    const ticket = await this.tickets.create({
      storeId,
      type: input.type,
      priority: input.priority ?? UberOpsTicketPriority.MEDIUM,
      title: input.title,
      description: input.description,
      externalOrderId: input.externalOrderId,
      menuItemStableId: input.menuItemStableId,
      context,
    });
    await this.telemetry.captureEvent('ubereats_ops_ticket_created', {
      storeId,
      ticketStableId: ticket.ticketStableId,
      type: input.type,
      priority: ticket.priority,
    });
    return { ok: true, ...ticket, storeId };
  }
}

export class RetryUberOpsTicketUseCase {
  constructor(
    private readonly unitOfWork: UberOperationsUnitOfWorkPort,
    private readonly orderStatusSync: SyncUberOrderStatusUseCase,
    private readonly menuPublish: PublishUberMenuUseCase,
    private readonly menuAvailability: UberMenuAvailabilityUseCase,
    private readonly storeStatusSync: SyncUberStoreStatusUseCase,
    private readonly telemetry: UberTelemetryPort,
  ) {}
  async execute(id: string): Promise<UberOpsTicketRetryResult> {
    const ticket = await this.unitOfWork.transaction(async ({ tickets }) => {
      const found = await tickets.find(id);
      if (!found) throw invalidOperationsInput(`工单 ${id} 不存在`);
      await tickets.markInProgress(id);
      return found;
    });
    let retryError: unknown;
    try {
      if (ticket.type === UberOpsTicketType.ORDER_STATUS_SYNC) {
        if (!ticket.externalOrderId)
          throw invalidOperationsInput('订单状态同步工单缺少 externalOrderId');
        await this.orderStatusSync.execute(
          ticket.externalOrderId,
          parseOrderContext(ticket.context).targetStatus,
        );
      } else if (ticket.type === UberOpsTicketType.STORE_STATUS_SYNC) {
        const result = await this.storeStatusSync.syncStoreStatusToUber(
          parseStoreContext(ticket.context),
        );
        if (!result.ok) throw new Error('Uber 门店状态同步失败');
      } else if (ticket.type === UberOpsTicketType.MENU_PUBLISH)
        await this.menuPublish.execute(
          parsePublishContext(ticket.context).publish,
        );
      else if (ticket.type === UberOpsTicketType.MENU_ITEM_AVAILABILITY) {
        if (!ticket.menuItemStableId)
          throw invalidOperationsInput('商品状态工单缺少 menuItemStableId');
        await this.menuAvailability.syncUberMenuItemAvailability({
          storeId: ticket.storeId,
          menuItemStableId: ticket.menuItemStableId,
          isAvailable: parseAvailabilityContext(ticket.context).isAvailable,
        });
      }
    } catch (error) {
      retryError = error;
    }
    const errorMessage = retryError
      ? retryError instanceof Error
        ? retryError.message
        : 'unknown_error'
      : null;
    const updated = await this.unitOfWork.transaction(({ tickets }) =>
      tickets.finishRetry(id, errorMessage),
    );
    await this.telemetry.captureEvent('ubereats_ops_ticket_retried', {
      ticketStableId: id,
      status: updated.status,
      retryCount: updated.retryCount,
      ...(updated.lastError ? { lastError: updated.lastError } : {}),
    });
    if (retryError) throw toUberEatsApplicationError(retryError);
    return { ok: !updated.lastError, ...updated };
  }
}

export class QueryUberOperationsSummary {
  constructor(
    private readonly reports: UberReconciliationRepositoryPort,
    private readonly ticketRepository: UberOpsTicketRepositoryPort,
  ) {}
  async listReports(
    storeId?: string,
    limit = 20,
  ): Promise<UberPage<UberReconciliationReport>> {
    const normalized = normalizeUberStoreId(storeId);
    const items = await this.reports.list(
      normalized,
      Math.min(Math.max(1, Number(limit) || 20), 100),
    );
    return { storeId: normalized, count: items.length, items };
  }
  reconciliation(storeId?: string): Promise<UberOperationsCountSummary> {
    return this.reports.summary(normalizeUberStoreId(storeId));
  }
  async listTickets(
    storeId?: string,
    status?: UberOpsTicketStatus,
  ): Promise<UberPage<UberOpsTicket>> {
    const normalized = normalizeUberStoreId(storeId);
    const items = await this.ticketRepository.list(normalized, status);
    return { storeId: normalized, count: items.length, items };
  }
  ticketsSummary(
    storeId?: string,
    status?: UberOpsTicketStatus,
  ): Promise<UberOperationsCountSummary> {
    return this.ticketRepository.summary(normalizeUberStoreId(storeId), status);
  }
  tickets(
    storeId?: string,
    status?: UberOpsTicketStatus,
  ): Promise<UberOperationsCountSummary> {
    return this.ticketsSummary(storeId, status);
  }
}

const requireContext = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalidOperationsInput('工单缺少合法的结构化 context');
  return value as Record<string, unknown>;
};
const parseOrderContext = (value: unknown): OrderStatusSyncContext => {
  const c = requireContext(value);
  if (
    !Object.values(UberOrderStatus).includes(c.targetStatus as UberOrderStatus)
  )
    throw invalidOperationsInput('订单状态同步工单的 targetStatus 非法');
  return { targetStatus: c.targetStatus as UberOrderStatus };
};
const parseAvailabilityContext = (
  value: unknown,
): MenuItemAvailabilityContext => {
  const c = requireContext(value);
  if (typeof c.isAvailable !== 'boolean')
    throw invalidOperationsInput('商品状态工单缺少布尔值 isAvailable');
  return { isAvailable: c.isAvailable };
};
const parseStoreContext = (value: unknown): StoreStatusSyncContext => {
  const c = requireContext(value);
  if (typeof c.uberStoreId !== 'string' || !c.uberStoreId.trim())
    throw invalidOperationsInput('门店状态工单缺少 uberStoreId');
  if (c.targetStatus !== 'ONLINE' && c.targetStatus !== 'PAUSED')
    throw invalidOperationsInput('门店状态工单的 targetStatus 非法');
  return {
    uberStoreId: c.uberStoreId,
    targetStatus: c.targetStatus,
    ...(typeof c.reason === 'string' ? { reason: c.reason } : {}),
    ...(typeof c.pauseUntil === 'string' ? { pauseUntil: c.pauseUntil } : {}),
  };
};
const parsePublishContext = (value: unknown): MenuPublishContext => {
  const c = requireContext(value);
  const publish = requireContext(c.publish);
  if (
    typeof publish.storeId !== 'string' ||
    !publish.storeId.trim() ||
    publish.dryRun !== false
  )
    throw invalidOperationsInput('菜单发布工单缺少完整的 publish 参数');
  return {
    ...(typeof c.versionId === 'string' ? { versionId: c.versionId } : {}),
    publish: publish as MenuPublishContext['publish'],
  };
};
const parseTicketContext = (type: UberOpsTicketType, value: unknown) => {
  if (type === UberOpsTicketType.ORDER_STATUS_SYNC)
    return parseOrderContext(value);
  if (type === UberOpsTicketType.MENU_ITEM_AVAILABILITY)
    return parseAvailabilityContext(value);
  if (type === UberOpsTicketType.STORE_STATUS_SYNC)
    return parseStoreContext(value);
  if (type === UberOpsTicketType.MENU_PUBLISH)
    return parsePublishContext(value);
  throw invalidOperationsInput('不支持的工单类型');
};
const reportRange = (startValue?: string, endValue?: string) => {
  const rangeEnd = endValue ? new Date(endValue) : new Date();
  const rangeStart = startValue
    ? new Date(startValue)
    : new Date(rangeEnd.getTime() - 86400000);
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime()))
    throw invalidOperationsInput('对账时间范围格式不正确');
  if (rangeStart >= rangeEnd)
    throw invalidOperationsInput('对账时间范围不合法：start 必须早于 end');
  return { rangeStart, rangeEnd };
};
