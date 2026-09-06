import { Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from './identity-prisma';
import { OPERATIONS_ALERT_RECIPIENTS } from './operations-alert-recipient.contract';
import { OperationsAlertRecipientService } from './operations-alert-recipient.service';

@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: OperationsAlertRecipientService,
      useFactory: (prisma: PrismaService) =>
        new OperationsAlertRecipientService(prisma),
      inject: [PrismaService],
    },
    {
      provide: OPERATIONS_ALERT_RECIPIENTS,
      useExisting: OperationsAlertRecipientService,
    },
  ],
  exports: [OPERATIONS_ALERT_RECIPIENTS],
})
export class OperationsAlertRecipientModule {}
