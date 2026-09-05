import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StaffAdministrationError } from '../../auth/public-api';
import { AdminStaffController } from './admin-staff.controller';

describe('AdminStaffController Staff Administration boundary', () => {
  const createController = () => {
    const staffAdministration = {
      listStaff: jest.fn(),
      updateStaff: jest.fn(),
      listInvites: jest.fn(),
      createInvite: jest.fn(),
      resendInvite: jest.fn(),
      revokeInvite: jest.fn(),
    };
    const controller = new AdminStaffController(staffAdministration as never);
    return { controller, staffAdministration };
  };

  it('delegates staff mutation using stable business identities only', async () => {
    const { controller, staffAdministration } = createController();
    staffAdministration.updateStaff.mockResolvedValue({
      userStableId: 'target-stable-id',
      role: 'STAFF',
      status: 'ACTIVE',
    });

    await controller.updateStaff(
      { user: { userStableId: 'actor-stable-id' } },
      'target-stable-id',
      { role: 'STAFF' },
    );

    expect(staffAdministration.updateStaff).toHaveBeenCalledWith({
      actorUserStableId: 'actor-stable-id',
      targetUserStableId: 'target-stable-id',
      role: 'STAFF',
      status: undefined,
    });
  });

  it('maps Identity user-not-found to the existing 404 transport response', async () => {
    const { controller, staffAdministration } = createController();
    staffAdministration.updateStaff.mockRejectedValue(
      new StaffAdministrationError('USER_NOT_FOUND', 'User not found'),
    );

    await expect(
      controller.updateStaff(
        { user: { userStableId: 'actor-stable-id' } },
        'missing-stable-id',
        { role: 'STAFF' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps Identity staff invariants to the existing 400 transport response', async () => {
    const { controller, staffAdministration } = createController();
    staffAdministration.updateStaff.mockRejectedValue(
      new StaffAdministrationError(
        'LAST_ACTIVE_ADMIN',
        'Cannot modify last active admin',
      ),
    );

    await expect(
      controller.updateStaff(
        { user: { userStableId: 'actor-stable-id' } },
        'target-stable-id',
        { role: 'STAFF' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
