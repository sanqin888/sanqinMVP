import { OperationsAlertRecipientService } from './operations-alert-recipient.service';

describe('OperationsAlertRecipientService', () => {
  it('returns active admin contacts with stable user identity and no DB identity exposure', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        userStableId: 'admin-stable-1',
        email: ' admin@example.com ',
        phone: ' +14165550000 ',
        language: 'ZH',
      },
      {
        userStableId: 'admin-stable-2',
        email: null,
        phone: '+14165550001',
        language: 'EN',
      },
    ]);
    const service = new OperationsAlertRecipientService({
      user: { findMany },
    } as never);

    await expect(service.listActiveAdminRecipients()).resolves.toEqual([
      {
        userStableId: 'admin-stable-1',
        email: 'admin@example.com',
        phone: '+14165550000',
        language: 'ZH',
      },
      {
        userStableId: 'admin-stable-2',
        email: null,
        phone: '+14165550001',
        language: 'EN',
      },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        role: 'ADMIN',
        status: 'ACTIVE',
        OR: [{ email: { not: null } }, { phone: { not: null } }],
      },
      select: {
        userStableId: true,
        email: true,
        phone: true,
        language: true,
      },
    });
  });
});
