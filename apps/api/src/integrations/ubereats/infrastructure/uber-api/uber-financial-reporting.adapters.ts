import { Inject, Injectable } from '@nestjs/common';
import { isIP } from 'net';
import { lookup } from 'dns/promises';
import * as fs from 'fs';
import * as path from 'path';
import { getUploadsAccountingDir } from '../../../../common/utils/uploads-path';
import type {
  UberFinancialReportApiPort,
  UberFinancialReportArtifactStorePort,
} from '../../application/operations/uber-financial-reporting.ports';
import type { UberEatsFinancialReportType } from '../../public-api';
import {
  UberApiGatewayTransport,
  type UberGatewayTransportPort,
} from './uber-api.gateway';
import { UBER_CLIENT_CREDENTIAL_SCOPES } from './uber-scopes';

@Injectable()
export class UberFinancialReportApiAdapter implements UberFinancialReportApiPort {
  constructor(
    @Inject(UberApiGatewayTransport)
    private readonly transport: UberGatewayTransportPort,
  ) {}

  async createReport(input: {
    reportType: UberEatsFinancialReportType;
    storeUuids: string[];
    startDate: string;
    endDate: string;
    idempotencyKey: string;
  }): Promise<{ workflowId: string }> {
    const response = await this.transport.request<{ workflow_id?: string }>({
      path: '/v1/eats/report',
      method: 'POST',
      operation: 'reporting.create',
      scope: UBER_CLIENT_CREDENTIAL_SCOPES.REPORT,
      partitionKey: 'merchant:app',
      idempotencyKey: input.idempotencyKey,
      json: {
        report_type: input.reportType,
        store_uuids: input.storeUuids,
        start_date: input.startDate,
        end_date: input.endDate,
      },
    });
    const workflowId = response.workflow_id?.trim();
    if (!workflowId) {
      throw new Error('Uber reporting response missing workflow_id');
    }
    return { workflowId };
  }
}

@Injectable()
export class UberFinancialReportArtifactStore implements UberFinancialReportArtifactStorePort {
  async downloadCsvSections(input: {
    workflowId: string;
    sections: Array<{ downloadUrl: string; sectionId: string | null }>;
  }): Promise<string[]> {
    const urls: string[] = [];
    for (let index = 0; index < input.sections.length; index += 1) {
      const section = input.sections[index];
      const response = await this.safeFetch(section.downloadUrl);
      const declaredLength = Number(
        response.headers.get('content-length') ?? '0',
      );
      if (declaredLength > 25 * 1024 * 1024) {
        throw new Error('Uber report section exceeds 25 MB');
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 25 * 1024 * 1024) {
        throw new Error('Uber report section exceeds 25 MB');
      }
      const dir = path.join(getUploadsAccountingDir(), 'uber-reports');
      await fs.promises.mkdir(dir, { recursive: true });
      const sectionId = (section.sectionId || `${index + 1}`)
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .slice(0, 80);
      const workflow = input.workflowId
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .slice(0, 80);
      const fileName = `${Date.now()}-${workflow}-${sectionId}.csv`;
      await fs.promises.writeFile(path.join(dir, fileName), bytes, {
        flag: 'wx',
      });
      urls.push(`/api/v1/accounting/files/uber-reports/${fileName}`);
    }
    return urls;
  }

  private async safeFetch(initialUrl: string): Promise<Response> {
    let current = initialUrl;
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      await this.assertPublicHttps(current);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      let response: Response;
      try {
        response = await fetch(current, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { Accept: 'text/csv,*/*;q=0.8' },
        });
      } finally {
        clearTimeout(timer);
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Uber report redirect missing location');
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) {
        throw new Error(`Uber report download failed with ${response.status}`);
      }
      return response;
    }
    throw new Error('Uber report download exceeded redirect limit');
  }

  private async assertPublicHttps(raw: string) {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' ||
      (url.port && url.port !== '443') ||
      url.username ||
      url.password
    ) {
      throw new Error('Unsafe Uber report download URL');
    }
    const addresses = isIP(url.hostname)
      ? [{ address: url.hostname }]
      : await lookup(url.hostname, { all: true, verbatim: true });
    if (
      !addresses.length ||
      addresses.some(({ address }) => !this.isPublicIp(address))
    ) {
      throw new Error('Unsafe Uber report download address');
    }
  }

  private isPublicIp(address: string): boolean {
    const normalized = address.toLowerCase();
    if (normalized.includes(':')) {
      return !(
        normalized === '::1' ||
        normalized === '::' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb')
      );
    }
    const octets = normalized.split('.').map(Number);
    return !(
      octets[0] === 10 ||
      octets[0] === 127 ||
      octets[0] === 0 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      octets[0] >= 224
    );
  }
}
