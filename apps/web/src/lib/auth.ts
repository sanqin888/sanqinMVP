// apps/web/src/lib/auth.ts

import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { createHash } from 'crypto';
import type { JWT } from 'next-auth/jwt';
import type { Session } from 'next-auth';

export type UserRole = 'ADMIN' | 'STAFF' | 'CUSTOMER';

type JWTWithUserId = JWT & { userId?: string; role?: UserRole };
type SessionWithUserId = Session & {
  userId?: string;
  role?: UserRole;
  user?: Session['user'] & { role?: UserRole };
};

const UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) {
    throw new Error('Invalid UUID format');
  }
  return Buffer.from(hex, 'hex');
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function uuidv5(name: string, namespace = UUID_NAMESPACE): string {
  const nsBytes = uuidToBytes(namespace);
  const hash = createHash('sha1')
    .update(nsBytes)
    .update(name)
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          prompt: 'select_account',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      const jwtToken: JWTWithUserId = token as JWTWithUserId;

      if (account?.provider === 'google' && profile) {
        const googleProfile = profile as {
          email?: string | null;
          sub?: string;
        };

        const email = (googleProfile.email ?? token.email ?? '')
          .trim()
          .toLowerCase();
        if (email) {
          jwtToken.userId = uuidv5(`google:${email}`);
          jwtToken.email = email;
        }

        if (!jwtToken.userId && googleProfile.sub) {
          jwtToken.userId = uuidv5(`google-sub:${googleProfile.sub}`);
        }
      }

      if (!jwtToken.userId && token.sub) {
        jwtToken.userId = uuidv5(`google-sub:${token.sub}`);
      }

      if (jwtToken.email) {
        jwtToken.email = jwtToken.email.trim().toLowerCase();
      }

      jwtToken.role = 'CUSTOMER';

      return jwtToken;
    },

    async session({ session, token }) {
      const jwtToken: JWTWithUserId = token as JWTWithUserId;
      const sessionWithUserId: SessionWithUserId = session as SessionWithUserId;

      if (jwtToken.userId) {
        sessionWithUserId.userId = jwtToken.userId;
      }

      if (sessionWithUserId.user) {
        if (jwtToken.email) {
          sessionWithUserId.user.email = jwtToken.email;
        }
        if (jwtToken.role) {
          sessionWithUserId.user.role = jwtToken.role;
        }
      }

      if (jwtToken.role) {
        sessionWithUserId.role = jwtToken.role;
      }

      return sessionWithUserId;
    },
  },
};
