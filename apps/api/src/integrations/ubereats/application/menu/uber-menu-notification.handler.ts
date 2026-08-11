import { Inject, Injectable } from '@nestjs/common';
export interface UberMenuNotification {
  publishVersion?: string | null;
  resourceId?: string | null;
  status: string;
  [key: string]: unknown;
}
export interface MenuNotificationRepository {
  findByCorrelation(input: {
    publishVersion: string | null;
    resourceId: string | null;
  }): Promise<{ id: string } | null>;
  apply(id: string, event: UberMenuNotification): Promise<void>;
}
export const MENU_NOTIFICATION_REPOSITORY = Symbol(
  'MENU_NOTIFICATION_REPOSITORY',
);
/** Correlates notifications by immutable publish version/resource id, never by store alone. */
@Injectable()
export class UberMenuNotificationHandler {
  constructor(
    @Inject(MENU_NOTIFICATION_REPOSITORY)
    private readonly repository: MenuNotificationRepository,
  ) {}
  async handle(event: UberMenuNotification) {
    const publishVersion = event.publishVersion?.trim() || null;
    const resourceId = event.resourceId?.trim() || null;
    if (!publishVersion && !resourceId)
      return { kind: 'ignored' as const, reason: 'missing_correlation' };
    const version = await this.repository.findByCorrelation({
      publishVersion,
      resourceId,
    });
    if (!version)
      return { kind: 'ignored' as const, reason: 'unknown_publication' };
    await this.repository.apply(version.id, event);
    return { kind: 'handled' as const, versionId: version.id };
  }
}
