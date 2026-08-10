import { UberMenuDraftService } from './uber-menu-draft.service';
import type { UberMenuWorkflowCore } from './uber-menu.workflow';

describe('UberMenuDraftService', () => {
  it('delegates getUberMenuDraft to the menu workflow boundary', async () => {
    const workflow = {
      getUberMenuDraft: jest.fn().mockResolvedValue({ ok: true }),
    };
    const service = new UberMenuDraftService(
      workflow as unknown as UberMenuWorkflowCore,
    );
    await expect(service.getUberMenuDraft('store-1')).resolves.toEqual({
      ok: true,
    });
    expect(workflow.getUberMenuDraft).toHaveBeenCalledWith('store-1');
  });
});
