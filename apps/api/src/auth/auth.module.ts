// apps/api/src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SessionAuthGuard } from './session-auth.guard';
import { OauthStateService } from './oauth/oauth-state.service';
import { GoogleStrategy } from './oauth/google.strategy';
import { GoogleStartGuard } from './oauth/google.guard';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [PrismaModule, PassportModule],
  providers: [
    AuthService,
    PrismaService,
    SessionAuthGuard,
    OauthStateService,
    GoogleStrategy,
    GoogleStartGuard,
  ],
  controllers: [AuthController],
  exports: [AuthService, SessionAuthGuard],
})
export class AuthModule {}
