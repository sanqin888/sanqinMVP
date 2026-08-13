import type { UberMenuDraftMutationPort } from './uber-menu-draft.ports';
import type { UberMenuReferenceValidator } from './uber-menu-reference-validator.service';
import { UpdateUberMenuDraftItemUseCase } from './update-uber-menu-draft-item.use-case';

describe('UpdateUberMenuDraftItemUseCase', () => {
  it('validates the item before opening its mutation transaction', async () => {
    const update = jest.fn();
    const missing = new Error('missing item');
    const useCase = new UpdateUberMenuDraftItemUseCase(
      { updateUberDraftItem: update } as unknown as UberMenuDraftMutationPort,
      {
        ensureMenuItemExists: jest.fn().mockRejectedValue(missing),
      } as unknown as UberMenuReferenceValidator,
    );

    await expect(useCase.updateItem('missing', {})).rejects.toBe(missing);
    expect(update).not.toHaveBeenCalled();
  });

  it('propagates a group transaction failure without retrying', async () => {
    const failure = new Error('transaction rolled back');
    const update = jest.fn().mockRejectedValue(failure);
    const useCase = new UpdateUberMenuDraftItemUseCase(
      { updateUberDraftGroup: update } as unknown as UberMenuDraftMutationPort,
      {} as UberMenuReferenceValidator,
    );

    await expect(useCase.updateGroup('group-1', {})).rejects.toBe(failure);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
