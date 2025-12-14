//Users/apple/sanqinMVP/apps/api/src/app.module.ts

import { Module, type DynamicModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LocationModule } from './location/location.module';
import { ConfigModule, type ConfigModuleOptions } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { OrdersModule } from './orders/orders.module';
import { ReportsModule } from './reports/reports.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { CloverModule } from './clover/clover.module';
import { CloverWebhooksModule } from './clover/clover-webhooks.module';
import { MembershipModule } from './membership/membership.module';
import { PhoneVerificationModule } from './phone-verification/phone-verification.module';
import { AuthModule } from './auth/auth.module';
import { RequestIdInterceptor } from './common/request-id.interceptor';
import { AdminModule } from './admin/admin.module';
import { StoreStatusModule } from './store/store-status.module';
import { BusinessHoursModule } from './admin/business-hours/business-hours.module';
import { AdminMenuModule } from './admin/menu/admin-menu.module';
import { AdminImageUploadModule } from './admin/upload/image/admin-image-upload.module';
import { PublicMenuModule } from './menu/public-menu.module';

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
    AuthModule,
    OrdersModule,
    MembershipModule,
    ReportsModule,
    LoyaltyModule,
    CloverModule,
    CloverWebhooksModule,
    LocationModule,
    PhoneVerificationModule,
    AdminModule,
    StoreStatusModule,
    BusinessHoursModule,
    AdminMenuModule,
    AdminImageUploadModule,
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
