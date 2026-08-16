import type { UberMenuUnitOfWork } from './uber-menu-repositories.ports';
import { mergeMenuAvailability } from '../../domain/menu/uber-menu-workflow.service';

/** Owns the transaction and coordinates the independently replaceable menu repositories. */
export class LoadUberMenuWorkflowUseCase {
  constructor(private readonly unitOfWork: UberMenuUnitOfWork) {}
  execute(storeId: string) {
    if (!storeId.trim()) throw new TypeError('storeId must not be empty');
    return this.unitOfWork.execute(async (repositories) => {
      const [snapshot, itemConfigs, modifiers, schedule, storeMapping] =
        await Promise.all([
          repositories.snapshots.load(),
          repositories.itemChannels.list(storeId),
          repositories.modifiers.list(storeId),
          repositories.schedules.get(),
          repositories.storeMappings.findByPosStoreId(storeId),
        ]);
      return {
        snapshot: mergeMenuAvailability(snapshot, itemConfigs),
        modifiers,
        schedule,
        storeMapping,
      };
    });
  }
}
