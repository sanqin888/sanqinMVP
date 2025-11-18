import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CheckoutIntentsService } from './checkout-intents.service';

@Module({
  imports: [PrismaModule],
  providers: [CheckoutIntentsService],
  exports: [CheckoutIntentsService],
})
export class CheckoutIntentsModule {}
