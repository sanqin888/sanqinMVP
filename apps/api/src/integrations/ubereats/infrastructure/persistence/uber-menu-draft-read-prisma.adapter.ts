import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UberValidationError } from '../../application/shared/uber-application.error';
import type { UberMenuDraftReadPort } from '../../application/menu/uber-menu-draft.ports';
import {
  UBER_PUBLIC_BASE_URL,
  type UberPublicBaseUrlPort,
} from '../../application/menu/uber-menu-publication.ports';
import {
  buildUberUploadMenuPayload,
  validateUberMenuPayload,
} from '../../domain/menu/uber-menu-payload.builder';
import {
  buildUberMenuGraph,
  summarizeUberMenuGraph,
  validateUberMenuGraph,
  type UberMenuGraph,
} from '../../domain/menu/uber-menu-graph.service';
import { emptyUberMenuDraftFilters } from '../../domain/menu/uber-menu-draft-source';
import {
  buildDraftCategories,
  buildUberDraftEdges,
  buildUberDraftTreeNodes,
} from '../../domain/menu/uber-menu-draft.projector';
import type { UberServiceAvailability } from '../../domain/menu/uber-payload.utils';
import type { UberMenuDraftJsonValue } from '../../domain/menu/uber-menu-diff.types';
import { validateUberBusinessSchedule } from '../../domain/menu/uber-business-schedule.validator';
import { normalizeUberStoreId } from '../../domain/merchant/uber-store-id';
import { UberMenuDraftSourcePrismaRepository } from './uber-menu-draft.repositories';

const uberMenuValidation = (message: string) =>
  new UberValidationError({
    code: 'UBER_MENU_INPUT_INVALID',
    message,
    operation: 'menu.validate',
    upstreamStatus: null,
  });

type InternalValidationIssue = {
  code: string;
  severity?: 'ERROR' | 'WARNING';
  path?: string;
  message: string;
  sourceStableId?: string | null;
  itemId?: string;
  itemStableId?: string;
  groupId?: string;
  groupStableId?: string;
  optionItemId?: string;
};

@Injectable()
export class UberMenuDraftReadPrismaAdapter implements UberMenuDraftReadPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UBER_PUBLIC_BASE_URL)
    private readonly urls: UberPublicBaseUrlPort,
  ) {}

  async getUberMenuDraft(storeId?: string) {
    const requestedStoreId = normalizeUberStoreId(storeId);
    const storeMapping = await this.prisma.uberStoreMapping.findFirst({
      where: {
        isProvisioned: true,
        OR: [
          { posExternalStoreId: requestedStoreId },
          { uberStoreId: requestedStoreId },
        ],
      },
      select: { uberStoreId: true, posExternalStoreId: true },
    });
    const mappedPosStoreId = storeMapping?.posExternalStoreId?.trim() || null;
    const isProvisioned = Boolean(
      storeMapping?.uberStoreId && mappedPosStoreId,
    );
    const posStoreId = mappedPosStoreId ?? requestedStoreId;
    const uberStoreId = isProvisioned
      ? storeMapping!.uberStoreId
      : `draft:${requestedStoreId}`;
    const graph = await this.buildUberMenuGraph(posStoreId, uberStoreId);
    const validation = validateUberMenuGraph(graph);
    const normalized = {
      graph: validation.graph,
      warnings: validation.warnings,
      errors: validation.kind === 'invalid' ? validation.errors : [],
    };
    const schedule = await this.getUberMenuSchedule();
    const payload = buildUberUploadMenuPayload(
      normalized.graph,
      schedule.serviceAvailability,
      schedule.taxRatePercentage,
      { publicBaseUrl: this.urls.publicBaseUrl },
    );
    const payloadValidation = validateUberMenuPayload(payload);
    const summary = summarizeUberMenuGraph(normalized.graph);
    const lastPublishedVersion =
      await this.prisma.uberMenuPublishVersion.findFirst({
        where: { storeId: posStoreId },
        orderBy: { createdAt: 'desc' },
        select: {
          versionStableId: true,
          status: true,
          createdAt: true,
          totalItems: true,
          changedItems: true,
          errorMessage: true,
          errorDetails: true,
          finishedAt: true,
        },
      });

    const uberDraftCategories = buildDraftCategories(normalized.graph);
    const sourceDraftCategories = buildDraftCategories({
      categories: graph.categories,
      groups: graph.sourceGroups,
      items: graph.sourceItems,
    });
    const uberDraftTreeNodes = buildUberDraftTreeNodes(uberDraftCategories);
    const stableIdsByNodeId = this.stableIdsByNodeId(
      normalized.graph,
      posStoreId,
    );
    const projectIssue = (issue: InternalValidationIssue) =>
      this.projectValidationIssue(issue, stableIdsByNodeId);
    const stableIdOf = (nodeId: string) =>
      stableIdsByNodeId.get(nodeId) ?? nodeId;

    return {
      storeId: requestedStoreId,
      sourceMenu: {
        categories: graph.categories.length,
        items: graph.sourceItems.filter(
          (item) => item.sourceType === 'MENU_ITEM',
        ).length,
        optionItems: graph.sourceItems.filter(
          (item) => item.sourceType === 'OPTION_ITEM',
        ).length,
        groups: graph.sourceGroups.length,
        tree: { categories: sourceDraftCategories },
      },
      uberDraft: {
        categories: normalized.graph.categories.map((category) => ({
          stableId: category.sourceStableId,
          itemStableIds: category.entities.map(stableIdOf),
        })),
        items: normalized.graph.items.map((item) => ({
          sourceType: item.sourceType,
          stableId: item.sourceStableId,
          priceCents: item.priceCents,
          isAvailable: item.isAvailable,
          hasDelta: item.hasDelta,
        })),
        groups: normalized.graph.groups.map((group) => ({
          stableId: group.sourceStableId,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          optionStableIds: group.optionItemIds.map(stableIdOf),
        })),
        edges: buildUberDraftEdges(normalized.graph),
        tree: {
          categories: uberDraftCategories,
        },
        treeNodes: uberDraftTreeNodes,
        optionMappings: graph.optionMappings.map((mapping) => ({
          stableId: mapping.sourceOptionChoiceStableId,
          sourcePath: mapping.sourcePath,
        })),
      },
      mappingErrors: graph.mappingErrors.map((error) => ({
        code: error.code,
        stableId: error.sourceOptionChoiceStableId,
        message: error.message,
      })),
      validation: {
        warnings: normalized.warnings.map(projectIssue),
        errors: [...normalized.errors, ...payloadValidation].map(projectIssue),
      },
      mappingWarnings: [
        ...payloadValidation.map(projectIssue),
        ...(isProvisioned
          ? []
          : [
              {
                code: 'UBER_STORE_NOT_PROVISIONED',
                severity: 'WARNING' as const,
                path: '$',
                stableId: null,
                message:
                  '当前门店尚未完成 Uber store provision，返回的是本地 draft 图。',
              },
            ]),
      ],
      publishSummary: summary,
      serviceAvailability: schedule.serviceAvailability,
      serviceAvailabilityTimezone: schedule.timezone,
      dirty: summary.changedItems > 0,
      lastPublishedVersion: lastPublishedVersion
        ? {
            ...lastPublishedVersion,
            errorDetails:
              lastPublishedVersion.errorDetails as UberMenuDraftJsonValue,
          }
        : null,
    };
  }

  private stableIdsByNodeId(graph: UberMenuGraph, storeId: string) {
    return new Map<string, string>([
      [graph.menuId, storeId],
      ...graph.categories.map(
        (category) => [category.id, category.sourceStableId] as const,
      ),
      ...graph.items.map((item) => [item.id, item.sourceStableId] as const),
      ...graph.groups.map((group) => [group.id, group.sourceStableId] as const),
    ]);
  }

  private projectValidationIssue(
    issue: InternalValidationIssue,
    stableIdsByNodeId: ReadonlyMap<string, string>,
  ) {
    const stableId =
      issue.itemStableId ??
      issue.groupStableId ??
      (issue.sourceStableId
        ? (stableIdsByNodeId.get(issue.sourceStableId) ?? issue.sourceStableId)
        : null) ??
      (issue.itemId ? stableIdsByNodeId.get(issue.itemId) : undefined) ??
      (issue.groupId ? stableIdsByNodeId.get(issue.groupId) : undefined) ??
      (issue.optionItemId
        ? stableIdsByNodeId.get(issue.optionItemId)
        : undefined) ??
      null;
    const replaceNodeIds = (value: string) => {
      let result = value;
      for (const [nodeId, sourceStableId] of stableIdsByNodeId) {
        result = result.replaceAll(nodeId, sourceStableId);
      }
      return result;
    };
    return {
      code: issue.code,
      severity: issue.severity ?? 'ERROR',
      path: replaceNodeIds(issue.path ?? '$'),
      stableId,
      message: replaceNodeIds(issue.message),
    };
  }

  private async buildUberMenuGraph(storeId: string, uberStoreId: string) {
    const source = await new UberMenuDraftSourcePrismaRepository(
      this.prisma,
    ).load(storeId, uberStoreId);
    return buildUberMenuGraph(source, emptyUberMenuDraftFilters());
  }

  private async readBusinessSchedule() {
    const [config, hours] = await Promise.all([
      this.prisma.businessConfig.findUnique({
        where: { id: 1 },
        select: { timezone: true, salesTaxRate: true },
      }),
      this.prisma.businessHour.findMany({ orderBy: { weekday: 'asc' } }),
    ]);
    return config ? { ...config, hours } : null;
  }

  private async getUberMenuSchedule(): Promise<{
    timezone: string;
    serviceAvailability: UberServiceAvailability[];
    taxRatePercentage: number;
    taxRateSource: string;
  }> {
    const result = validateUberBusinessSchedule(
      await this.readBusinessSchedule(),
    );
    if (!result.valid) throw uberMenuValidation(result.message);
    return { ...result, taxRateSource: 'BusinessConfig.salesTaxRate' };
  }
}
