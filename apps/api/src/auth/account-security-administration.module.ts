import { Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from './identity-prisma';
import { ACCOUNT_SECURITY_ADMINISTRATION } from './account-security-administration.contract';
import { AccountSecurityAdministrationService } from './account-security-administration.service';

@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: AccountSecurityAdministrationService,
      useFactory: (prisma: PrismaService) =>
        new AccountSecurityAdministrationService(prisma),
      inject: [PrismaService],
    },
    {
      provide: ACCOUNT_SECURITY_ADMINISTRATION,
      useExisting: AccountSecurityAdministrationService,
    },
  ],
  exports: [ACCOUNT_SECURITY_ADMINISTRATION],
})
export class AccountSecurityAdministrationModule {}
