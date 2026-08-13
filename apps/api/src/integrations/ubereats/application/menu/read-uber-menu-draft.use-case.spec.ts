import type { UberMenuDraftReadPort } from './uber-menu-draft.ports';
import { ReadUberMenuDraftUseCase } from './read-uber-menu-draft.use-case';

describe('ReadUberMenuDraftUseCase', () => {
  it('delegates the requested store to the draft query', async () => {
    const execute = jest.fn().mockResolvedValue({ storeId: 'store-1' });
    const useCase = new ReadUberMenuDraftUseCase({
      getUberMenuDraft: execute,
    } as UberMenuDraftReadPort);
    await expect(useCase.execute('store-1')).resolves.toEqual({
      storeId: 'store-1',
    });
    expect(execute).toHaveBeenCalledWith('store-1');
  });
});
