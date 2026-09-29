import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MembershipController } from './membership.controller';

describe('Membership customer role boundary', () => {
  it(
    'admits only CUSTOMER identities to the authenticated membership surface',
    () => {
      expect(Reflect.getMetadata(ROLES_KEY, MembershipController)).toEqual([
        'CUSTOMER',
      ]);
      expect(
        Reflect.getMetadata(GUARDS_METADATA, MembershipController),
      ).toEqual(expect.arrayContaining([RolesGuard]));
    },
  );
});
