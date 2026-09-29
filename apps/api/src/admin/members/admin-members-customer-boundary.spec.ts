import { NotFoundException } from '@nestjs/common';
import { ROLES_KEY } from '../../auth/roles.decorator';
import { AdminMembersController } from './admin-members.controller';
import { AdminMembersService } from './admin-members.service';

function createService(role: 'CUSTOMER' | 'STAFF' | 'ADMIN' | 'ACCOUNTANT') {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-db-id',
        userStableId: 'user-stable-id',
        role,
      }),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    loyaltyAccount: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const loyalty = {
    ensureAccount: jest.fn(),
    adjustPointsManual: jest.fn(),
    applyTopup: jest.fn(),
  };
  const loyaltyLedgerReader = {
    getLoyaltyLedger: jest.fn(),
  };
  const loyaltyPolicyReader = {
    getLoyaltyPolicySnapshot: jest.fn(),
  };
  const customerAdministration = {
    listAddressesAsAdmin: jest.fn(),
    updateProfileAsAdmin: jest.fn(),
  };
  const accountSecurityAdministration = {
    getDeviceManagement: jest.fn(),
    revokeSession: jest.fn(),
    revokeTrustedDevice: jest.fn(),
    setAccountStatus: jest.fn(),
  };
  const memberRechargeVerification = {
    sendCode: jest.fn(),
    verifyCode: jest.fn(),
    consumeVerificationToken: jest.fn(),
  };

  const service = new AdminMembersService(
    prisma as never,
    loyalty as never,
    loyaltyLedgerReader as never,
    loyaltyPolicyReader as never,
    customerAdministration as never,
    accountSecurityAdministration as never,
    memberRechargeVerification as never,
  );

  return {
    service,
    prisma,
    loyalty,
    loyaltyPolicyReader,
    customerAdministration,
    accountSecurityAdministration,
    memberRechargeVerification,
  };
}

describe('Admin Members customer target boundary', () => {
  it('keeps STAFF as an authorized operator while member targets are contracted separately', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminMembersController)).toEqual([
      'ADMIN',
      'STAFF',
    ]);
  });

  it('always scopes the Admin member list to CUSTOMER identities', async () => {
    const { service, prisma } = createService('CUSTOMER');

    await service.listMembers({});

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { role: 'CUSTOMER' },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: 'CUSTOMER' },
      }),
    );
  });

  it.each(['STAFF', 'ADMIN', 'ACCOUNTANT'] as const)(
    'rejects a %s target before member detail can materialize Loyalty state',
    async (role) => {
      const { service, loyalty, loyaltyPolicyReader } = createService(role);

      await expect(
        service.getMemberDetail('user-stable-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(loyalty.ensureAccount).not.toHaveBeenCalled();
      expect(
        loyaltyPolicyReader.getLoyaltyPolicySnapshot,
      ).not.toHaveBeenCalled();
    },
  );

  it('blocks non-customer targets before member mutation/security owners are invoked', async () => {
    const {
      service,
      loyalty,
      customerAdministration,
      accountSecurityAdministration,
      memberRechargeVerification,
    } = createService('STAFF');

    await expect(
      service.listAddresses('user-stable-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getDeviceManagement('user-stable-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.updateMember('user-stable-id', { firstName: 'Blocked' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.adjustPoints('user-stable-id', { deltaPoints: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.setMemberStatus('user-stable-id', true),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.sendRechargeCode('user-stable-id', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.verifyRechargeCode('user-stable-id', { code: '123456' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.rechargeWithVerification('user-stable-id', {
        amountCents: 1000,
        verificationToken: 'token',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(customerAdministration.listAddressesAsAdmin).not.toHaveBeenCalled();
    expect(customerAdministration.updateProfileAsAdmin).not.toHaveBeenCalled();
    expect(
      accountSecurityAdministration.getDeviceManagement,
    ).not.toHaveBeenCalled();
    expect(
      accountSecurityAdministration.setAccountStatus,
    ).not.toHaveBeenCalled();
    expect(loyalty.adjustPointsManual).not.toHaveBeenCalled();
    expect(loyalty.applyTopup).not.toHaveBeenCalled();
    expect(memberRechargeVerification.sendCode).not.toHaveBeenCalled();
    expect(memberRechargeVerification.verifyCode).not.toHaveBeenCalled();
    expect(
      memberRechargeVerification.consumeVerificationToken,
    ).not.toHaveBeenCalled();
  });
});
