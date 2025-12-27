//apps/api/src/auth/oauth/google.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';

export type GoogleProfile = {
  sub: string;
  email: string | null;
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

  async validate(_at: string, _rt: string, profile: Profile): Promise<GoogleProfile> {
    const email =
      profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
    return {
      sub: profile.id,
      email,
      name: profile.displayName ?? null,
    };
  }
}
