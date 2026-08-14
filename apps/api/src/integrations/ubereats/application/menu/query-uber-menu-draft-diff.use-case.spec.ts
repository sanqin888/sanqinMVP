import type { UberMenuDraftDiffPort } from './uber-menu-draft.ports';
import { QueryUberMenuDraftDiffUseCase } from './query-uber-menu-draft-diff.use-case';

describe('QueryUberMenuDraftDiffUseCase', () => {
  it('returns the difference calculated by the dedicated query port', async () => {
    const diff = { storeId: 'store-1', summary: { changed: 2 } };
    const query = jest.fn().mockResolvedValue(diff);
    const useCase = new QueryUberMenuDraftDiffUseCase({
      getUberMenuDraftDiff: query,
    } as unknown as UberMenuDraftDiffPort);
    await expect(useCase.execute('store-1')).resolves.toEqual(diff);
    expect(query).toHaveBeenCalledWith('store-1');
  });
});
