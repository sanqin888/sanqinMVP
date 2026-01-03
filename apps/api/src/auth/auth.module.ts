// apps/api/src/auth/auth.module.ts
import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SessionAuthGuard } from './session-auth.guard';
import { OauthStateService } from './oauth/oauth-state.service';
import { GoogleStrategy } from './oauth/google.strategy';
import { GoogleStartGuard } from './oauth/google.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from './roles.guard';
import { MfaGuard } from './mfa.guard';

@Global()
@Module({
  imports: [PrismaModule, PassportModule],
  providers: [
    AuthService,
    PrismaService,
    SessionAuthGuard,
    MfaGuard,
    OauthStateService,
    GoogleStrategy,
    GoogleStartGuard,
    RolesGuard,
  ],
  controllers: [AuthController],
  exports: [AuthService, SessionAuthGuard, MfaGuard, RolesGuard],
})
export class AuthModule {}
