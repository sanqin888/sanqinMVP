// apps/api/src/auth/oauth/google.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';

export type GoogleProfile = {
  sub: string;
  email: string | null;
  emailVerified: boolean | null;
  name: string | null;
};

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      callbackURL: process.env.GOOGLE_OAUTH_CALLBACK_URL ?? '',
      scope: ['email', 'profile'],
    });
  }

  validate(_at: string, _rt: string, profile: Profile): GoogleProfile {
    const email =
      profile.emails && profile.emails.length > 0
        ? profile.emails[0].value
        : null;
    const profileJson = (
      profile as Profile & {
        _json?: { email_verified?: boolean };
      }
    )._json;
    const emailVerified =
      typeof profileJson?.email_verified === 'boolean'
        ? profileJson.email_verified
        : (profile.emails?.[0]?.verified ?? null);
    return {
      sub: profile.id,
      email,
      emailVerified,
      name: profile.displayName ?? null,
    };
  }
}
