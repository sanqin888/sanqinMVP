import { StaffInviteDeliveryService } from './staff-invite-delivery.service';

describe('StaffInviteDeliveryService characterization', () => {
  it('forwards the existing staff invite facts', async () => {
    const emailService = { sendStaffInviteEmail: jest.fn() };
    emailService.sendStaffInviteEmail.mockResolvedValue({
      ok: true,
      sendId: 'send-1',
    });
    const service = new StaffInviteDeliveryService(emailService as never);

    await expect(
      service.sendStaffInvite({
        to: 'accounting@example.com',
        token: 'invite-token',
        role: 'ACCOUNTANT',
        inviterName: 'San Qin',
        locale: 'zh',
      }),
    ).resolves.toEqual({ ok: true, sendId: 'send-1' });

    expect(emailService.sendStaffInviteEmail).toHaveBeenCalledWith({
      to: 'accounting@example.com',
      token: 'invite-token',
      role: 'ACCOUNTANT',
      inviterName: 'San Qin',
      locale: 'zh',
    });
  });

  it('preserves provider failure details', async () => {
    const emailService = { sendStaffInviteEmail: jest.fn() };
    emailService.sendStaffInviteEmail.mockResolvedValue({
      ok: false,
      error: 'suppressed',
      sendId: 'send-failed',
    });
    const service = new StaffInviteDeliveryService(emailService as never);

    await expect(
      service.sendStaffInvite({
        to: 'staff@example.com',
        token: 'invite-token',
        role: 'STAFF',
      }),
    ).resolves.toEqual({
      ok: false,
      error: 'suppressed',
      sendId: 'send-failed',
    });
  });
});
