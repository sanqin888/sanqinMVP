import { NotFoundException } from '@nestjs/common';
import { MembershipService } from './membership.service';

describe('MembershipService existing-user read boundary', () => {
  it('does not create or mutate a customer when summary stable id is unknown', async () => {
    const create = jest.fn();
    const update = jest.fn();
    const service = new MembershipService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue(null),
          create,
          update,
        },
      } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getMemberSummary({ userStableId: 'missing-customer-stable' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it.each(['STAFF', 'ADMIN', 'ACCOUNTANT'])(
    'does not materialize membership state for a %s identity',
    async (role) => {
      const ensureAccount = jest.fn();
      const service = new MembershipService(
        {
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'non-customer-db-id',
              userStableId: 'non-customer-stable-id',
              role,
            }),
          },
        } as never,
        { ensureAccount } as never,
        {} as never,
      );

      await expect(
        service.getMemberSummary({ userStableId: 'non-customer-stable-id' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(ensureAccount).not.toHaveBeenCalled();
    },
  );
});
