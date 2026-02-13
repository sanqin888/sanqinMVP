//Users/apple/sanqinMVP/apps/api/src/app.module.ts

import { Module, type DynamicModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LocationModule } from './location/location.module';
import { ConfigModule, type ConfigModuleOptions } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { OrdersModule } from './orders/orders.module';
import { ReportsModule } from './reports/reports.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { CloverModule } from './clover/clover.module';
import { MembershipModule } from './membership/membership.module';
import { PhoneVerificationModule } from './phone-verification/phone-verification.module';
import { AuthModule } from './auth/auth.module';
import { RequestIdInterceptor } from './common/request-id.interceptor';
import { AdminModule } from './admin/admin.module';
import { StoreStatusModule } from './store/store-status.module';
import { PublicMenuModule } from './menu/public-menu.module';
import { PosModule } from './pos/pos.module';
import { CouponsModule } from './coupons/coupons.module';
import { EmailModule } from './email/email.module';
import { SmsModule } from './sms/sms.module';
import { NotificationModule } from './notifications/notification.module';

const configModuleFactory: {
  forRoot(options: ConfigModuleOptions): DynamicModule;
} = ConfigModule as unknown as {
  forRoot(options: ConfigModuleOptions): DynamicModule;
};

const envConfigModule = configModuleFactory.forRoot({
  isGlobal: true,
  envFilePath: ['apps/api/.env', '.env'],
  expandVariables: true,
});

@Module({
  imports: [
    envConfigModule,
    PrismaModule,
    CouponsModule,
    EmailModule,
    SmsModule,
    NotificationModule,
    EventEmitterModule.forRoot(),
    AuthModule,
    OrdersModule,
    PosModule,
    MembershipModule,
    ReportsModule,
    LoyaltyModule,
    CloverModule,
    LocationModule,
    PhoneVerificationModule,
    AdminModule,
    StoreStatusModule,
    PublicMenuModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // ✅ 挂上全局拦截器
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestIdInterceptor,
    },
  ],
})
export class AppModule {}
