import type { UberPublicBaseUrlPort } from '../../application/menu/uber-menu-publication.ports';
import { isPermanentPublicHttpsUrl } from '../../domain/menu/uber-menu.types';

/** Owns environment access and publishes one validated, immutable URL value. */
export class UberPublicBaseUrlAdapter implements UberPublicBaseUrlPort {
  readonly publicBaseUrl: string;

  constructor(env: Record<string, string | undefined> = process.env) {
    const configured =
      env.PUBLIC_BASE_URL?.trim() || env.WEB_BASE_URL?.trim() || '';
    let url: URL | null = null;
    try {
      url = configured ? new URL(configured) : null;
    } catch {
      // The common configuration error below intentionally names both sources.
    }
    if (
      !url ||
      !isPermanentPublicHttpsUrl(configured) ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'Uber 菜单图片要求 PUBLIC_BASE_URL 或 WEB_BASE_URL 为有效的公网 HTTPS URL',
      );
    }
    this.publicBaseUrl = url.toString();
  }
}
