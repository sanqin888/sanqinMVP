export type UberMenuNotificationStatus =
  | 'SUBMITTED'
  | 'PENDING'
  | 'SUCCEEDED'
  | 'FAILED';

export type UberMenuNotificationFailureDto = {
  code: string;
  path: string | null;
  message: string;
};

/** The documented payload carried by the `menus.notification` webhook. */
export class UberMenuNotificationDto {
  private constructor(
    readonly storeId: string,
    readonly resourceId: string,
    readonly status: UberMenuNotificationStatus,
    readonly failures: UberMenuNotificationFailureDto[],
  ) {}

  static parse(payload: unknown): UberMenuNotificationDto | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      return null;
    const root = payload as Record<string, unknown>;
    const data = asObject(root.data);
    const meta = asObject(root.meta);
    const read = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : null;
    const storeId = read(data?.store_id) ?? read(meta?.user_id);
    const resourceId = read(data?.resource_id) ?? read(meta?.resource_id);
    const status = read(data?.status)?.toUpperCase();
    if (
      !storeId ||
      !resourceId ||
      !status ||
      !['SUBMITTED', 'PENDING', 'SUCCEEDED', 'FAILED'].includes(status)
    )
      return null;

    const failure = asObject(data?.failure_info);
    const rawErrors = Array.isArray(failure?.errors)
      ? failure.errors
      : Array.isArray(data?.errors)
        ? data.errors
        : [];
    const failures = rawErrors.map((entry) => {
      const error = asObject(entry);
      return {
        code: read(error?.code) ?? 'UBER_MENU_ERROR',
        path: read(error?.path) ?? read(error?.field_path),
        message:
          read(error?.message) ??
          read(error?.description) ??
          'Uber 未提供错误说明',
      };
    });
    return new UberMenuNotificationDto(
      storeId,
      resourceId,
      status as UberMenuNotificationStatus,
      failures,
    );
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
