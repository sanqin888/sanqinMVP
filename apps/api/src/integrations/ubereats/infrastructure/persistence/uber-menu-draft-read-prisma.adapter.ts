import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UberValidationError } from '../../application/shared/uber-application.error';
import type { UberMenuDraftReadPort } from '../../application/menu/uber-menu-draft.ports';
import type { UberPublicBaseUrlPort } from '../../application/menu/uber-menu-publication.ports';
import {
  buildUberUploadMenuPayload,
  validateUberMenuPayload,
} from '../../domain/menu/uber-menu-payload.builder';
import {
  buildUberMenuGraph,
  summarizeUberMenuGraph,
  validateUberMenuGraph,
} from '../../domain/menu/uber-menu-graph.service';
import { emptyUberMenuDraftFilters } from '../../domain/menu/uber-menu-draft-source';
import {
  buildDraftCategories,
  buildUberDraftEdges,
  buildUberDraftTreeNodes,
} from '../../domain/menu/uber-menu-draft.projector';
import type { UberServiceAvailability } from '../../domain/menu/uber-payload.utils';
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

@Injectable()
export class UberMenuDraftReadPrismaAdapter implements UberMenuDraftReadPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly urls: UberPublicBaseUrlPort,
  ) {}

  async getUberMenuDraft(storeId?: string) {
    const normalizedStoreId = normalizeUberStoreId(storeId);
    const storeMapping = await this.prisma.uberStoreMapping.findFirst({
      where: {
        uberStoreId: normalizedStoreId,
        isProvisioned: true,
      },
      select: { uberStoreId: true },
    });
    const uberStoreId =
      storeMapping?.uberStoreId ?? `draft:${normalizedStoreId}`;
    const graph = await this.buildUberMenuGraph(normalizedStoreId, uberStoreId);
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
        where: { storeId: normalizedStoreId },
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

    return {
      storeId: normalizedStoreId,
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
        menuId: graph.menuId,
        categories: normalized.graph.categories,
        items: normalized.graph.items,
        groups: normalized.graph.groups,
        edges: buildUberDraftEdges(normalized.graph),
        tree: {
          categories: uberDraftCategories,
        },
        treeNodes: uberDraftTreeNodes,
        optionMappings: graph.optionMappings,
      },
      mappingErrors: graph.mappingErrors,
      validation: {
        warnings: normalized.warnings,
        errors: [...normalized.errors, ...payloadValidation],
      },
      mappingWarnings: [
        ...payloadValidation,
        ...(storeMapping?.uberStoreId
          ? []
          : [
              {
                code: 'UBER_STORE_NOT_PROVISIONED',
                severity: 'WARNING' as const,
                path: '$',
                sourceStableId: null,
                message:
                  '当前门店尚未完成 Uber store provision，返回的是本地 draft 图。',
              },
            ]),
      ],
      publishSummary: summary,
      serviceAvailability: schedule.serviceAvailability,
      serviceAvailabilityTimezone: schedule.timezone,
      dirty: summary.changedItems > 0,
      lastPublishedVersion,
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
