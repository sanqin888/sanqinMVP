import { UberMenuDraftUseCase } from './uber-menu-draft.use-case';
import type { UberMenuDraftReadPort } from '../ports/uber-menu-draft-workflow.ports';

describe('UberMenuDraftUseCase', () => {
  it('delegates getUberMenuDraft to the menu workflow boundary', async () => {
    const workflow = {
      getUberMenuDraft: jest.fn().mockResolvedValue({ ok: true }),
    };
    const service = new UberMenuDraftUseCase(
      {} as never,
      {} as never,
      workflow as unknown as UberMenuDraftReadPort,
      {} as never,
      {} as never,
    );
    await expect(service.getUberMenuDraft('store-1')).resolves.toEqual({
      ok: true,
    });
    expect(workflow.getUberMenuDraft).toHaveBeenCalledWith('store-1');
  });
});
