import { UberValidationError } from '../shared/uber-application.error';
import type { UberMenuReferenceQueryPort } from './uber-menu-draft.ports';

/** Reusable application validation for references accepted by menu commands. */
export class UberMenuReferenceValidator {
  constructor(private readonly references: UberMenuReferenceQueryPort) {}

  async ensureMenuItemExists(stableId: string): Promise<void> {
    if (!(await this.references.findMenuItemByStableId(stableId))) {
      throw this.invalid(`菜单项 ${stableId} 不存在`);
    }
  }

  async ensureOptionChoiceExists(stableId: string): Promise<void> {
    if (!(await this.references.findOptionChoiceByStableId(stableId))) {
      throw this.invalid(`选项 ${stableId} 不存在`);
    }
  }

  async resolveProvisionedUberStoreId(storeId: string): Promise<string> {
    const mapping = await this.references.findProvisionedStoreMapping(storeId);
    if (!mapping) {
      throw this.invalid(
        `未找到已 provision 的 Uber store 映射，请先完成店铺映射。storeId=${storeId}`,
      );
    }
    return mapping.uberStoreId;
  }

  private invalid(message: string): UberValidationError {
    return new UberValidationError({
      code: 'UBER_MENU_INPUT_INVALID',
      message,
      operation: 'menu.validate',
      upstreamStatus: null,
    });
  }
}
