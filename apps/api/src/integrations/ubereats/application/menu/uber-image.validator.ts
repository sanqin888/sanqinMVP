import { Injectable } from '@nestjs/common';
import type { UberMenuUploadPayload } from '../../domain/menu/uber-menu.types';
import {
  isPermanentPublicHttpsUrl,
  UBER_IMAGE_MAX_BYTES,
} from '../../domain/menu/uber-menu.types';
import type { UberMenuPayloadValidationIssue } from '../../domain/menu/uber-payload.utils';
import { UberHttpClient } from '../../infrastructure/http/uber-http.client';

export interface UberImagePolicy {
  protocols: readonly string[];
  allowedHosts: readonly string[];
  maxRedirects: number;
  timeoutMs: number;
  concurrency: number;
  maxResponseBytes: number;
}
export const DEFAULT_UBER_IMAGE_POLICY: UberImagePolicy = {
  protocols: ['https:'],
  allowedHosts: [],
  maxRedirects: 3,
  timeoutMs: 8_000,
  concurrency: 4,
  maxResponseBytes: UBER_IMAGE_MAX_BYTES,
};
@Injectable()
export class UberImageValidator {
  constructor(
    private readonly http: UberHttpClient,
    private readonly policy: UberImagePolicy = DEFAULT_UBER_IMAGE_POLICY,
  ) {}
  async validate(payload: UberMenuUploadPayload) {
    const issues: UberMenuPayloadValidationIssue[] = [];
    const results: any[] = [];
    const entries = payload.items
      .map((item, index) => ({ item, index }))
      .filter((x) => x.item.image_url);
    let cursor = 0;
    const worker = async () => {
      while (cursor < entries.length) {
        const { item, index } = entries[cursor++];
        const requestedUrl = item.image_url!;
        let method: 'HEAD' | 'GET' = 'HEAD';
        try {
          const parsed = new URL(requestedUrl);
          if (
            !this.policy.protocols.includes(parsed.protocol) ||
            (this.policy.allowedHosts.length > 0 &&
              !this.policy.allowedHosts.includes(parsed.hostname))
          )
            throw new Error('图片 URL 不符合协议或 host 策略');
          let result = await this.http.request({
            returnErrorResponse: true,
            url: requestedUrl,
            method: 'HEAD',
            redirect: 'follow',
            kind: 'imageProbe',
          });
          let response = result.response;
          if (response.status === 405 || response.status === 501) {
            method = 'GET';
            result = await this.http.request({
              returnErrorResponse: true,
              url: requestedUrl,
              method: 'GET',
              headers: { Range: `bytes=0-${this.policy.maxResponseBytes}` },
              redirect: 'follow',
              kind: 'imageProbe',
              maxResponseBytes: this.policy.maxResponseBytes + 1,
            });
            response = result.response;
          }
          const finalUrl = response.url || requestedUrl;
          const contentType =
            response.headers.get('content-type')?.split(';')[0] ?? null;
          const declared = Number(response.headers.get('content-length'));
          const sizeBytes =
            Number.isFinite(declared) && declared >= 0
              ? declared
              : method === 'GET'
                ? new TextEncoder().encode(result.text).byteLength
                : null;
          const errors: string[] = [];
          if (!response.ok) errors.push(`HTTP ${response.status}`);
          if (!isPermanentPublicHttpsUrl(finalUrl))
            errors.push('重定向后的地址不是永久公网 HTTPS URL');
          if (!contentType?.toLowerCase().startsWith('image/'))
            errors.push('Content-Type 不是 image/*');
          if (sizeBytes === null || sizeBytes > this.policy.maxResponseBytes)
            errors.push('图片响应大小无法确认或超过限制');
          if (errors.length)
            issues.push({
              code: 'UBER_IMAGE_PREFLIGHT_FAILED',
              severity: 'ERROR',
              path: `$.items[${index}].image_url`,
              sourceStableId: item.id,
              message: `图片发布前校验失败：${errors.join('；')}。`,
            });
          results.push({
            itemId: item.id,
            requestedUrl,
            finalUrl,
            finalOrigin: new URL(finalUrl).origin,
            redirected: finalUrl !== requestedUrl,
            contentType,
            sizeBytes,
            method,
            ok: !errors.length,
          });
        } catch (error) {
          issues.push({
            code: 'UBER_IMAGE_NOT_PUBLIC',
            severity: 'ERROR',
            path: `$.items[${index}].image_url`,
            sourceStableId: item.id,
            message: `图片无法公开访问：${error instanceof Error ? error.message : String(error)}`,
          });
          results.push({
            itemId: item.id,
            requestedUrl,
            finalUrl: null,
            finalOrigin: null,
            redirected: false,
            contentType: null,
            sizeBytes: null,
            method,
            ok: false,
          });
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(this.policy.concurrency, entries.length) },
        worker,
      ),
    );
    return { issues, results };
  }
}
