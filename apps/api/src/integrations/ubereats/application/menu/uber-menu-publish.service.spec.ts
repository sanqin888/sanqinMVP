import { UberMenuPublishService } from './uber-menu-publish.service';
import type { UberMenuPrismaAdapter } from '../../infrastructure/persistence/uber-menu-prisma.adapter';

describe('UberMenuPublishService', () => {
  it('delegates publishUberMenu to the menu workflow boundary', async () => {
    const workflow = {
      publishUberMenu: jest.fn().mockResolvedValue({ ok: true }),
    };
    const service = new UberMenuPublishService(
      workflow as unknown as UberMenuPrismaAdapter,
    );
    await expect(
      service.publishUberMenu('store-1', { dryRun: true }),
    ).resolves.toEqual({ ok: true });
    expect(workflow.publishUberMenu).toHaveBeenCalledWith('store-1', {
      dryRun: true,
    });
  });
});
