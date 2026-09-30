import { UberValidationError } from '../shared/uber-application.error';
import type {
  MenuItemExistenceQueryPort,
  OptionChoiceExistenceQueryPort,
} from './uber-menu-draft.ports';

const invalid = (message: string) =>
  new UberValidationError({
    code: 'UBER_MENU_INPUT_INVALID',
    message,
    operation: 'menu.validate',
    upstreamStatus: null,
  });

export async function ensureMenuItemExists(
  queries: MenuItemExistenceQueryPort,
  storeStableId: string,
  stableId: string,
): Promise<void> {
  if (!(await queries.menuItemExists(storeStableId, stableId))) {
    throw invalid(`菜单项 ${stableId} 不存在`);
  }
}

export async function ensureOptionChoiceExists(
  queries: OptionChoiceExistenceQueryPort,
  storeStableId: string,
  stableId: string,
): Promise<void> {
  if (!(await queries.optionChoiceExists(storeStableId, stableId))) {
    throw invalid(`选项 ${stableId} 不存在`);
  }
}
