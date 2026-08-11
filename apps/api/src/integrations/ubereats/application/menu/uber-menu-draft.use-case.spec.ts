import { UberMenuDraftUseCase } from './uber-menu-draft.use-case';
import type { UberMenuDraftPort } from '../ports/uber-use-case.ports';

describe('UberMenuDraftUseCase', () => {
  it('delegates getUberMenuDraft to the menu workflow boundary', async () => {
    const workflow = {
      getUberMenuDraft: jest.fn().mockResolvedValue({ ok: true }),
    };
    const service = new UberMenuDraftUseCase(
      workflow as unknown as UberMenuDraftPort,
    );
    await expect(service.getUberMenuDraft('store-1')).resolves.toEqual({
      ok: true,
    });
    expect(workflow.getUberMenuDraft).toHaveBeenCalledWith('store-1');
  });
});
