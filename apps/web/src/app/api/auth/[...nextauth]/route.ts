//Users/apple/sanqinMVP/apps/web/src/app/api/auth/[...nextauth]

import NextAuth, { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import type { JWT } from 'next-auth/jwt';
import type { Session } from 'next-auth';

type JWTWithUserId = JWT & { userId?: string };
type SessionWithUserId = Session & { userId?: string };

const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          // 为了测试方便，每次都弹出账号选择
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

      // 目前只有 Google，一个 provider 就够了
      if (account?.provider === 'google' && profile) {
        const googleProfile = profile as {
          email?: string | null;
          sub?: string;
        };

        // ✅ 1) 优先用邮箱的 @ 前部分
        const email = googleProfile.email ?? token.email;
        if (email) {
          const [localPart] = email.split('@');
          if (localPart && localPart.trim().length > 0) {
            jwtToken.userId = `google:${localPart.trim().toLowerCase()}`;
          }
        }

        // 2) 兜底：如果没拿到 email，再退回用 sub
        if (!jwtToken.userId && googleProfile.sub) {
          jwtToken.userId = `google:${googleProfile.sub}`;
        }
      }

      // 再兜一层底：万一上面都失败，但 token.sub 还在
      if (!jwtToken.userId && token.sub) {
        jwtToken.userId = `google:${token.sub}`;
      }

      return jwtToken;
    },

    async session({ session, token }) {
      const jwtToken: JWTWithUserId = token as JWTWithUserId;
      const sessionWithUserId: SessionWithUserId =
        session as SessionWithUserId;

      if (jwtToken.userId) {
        sessionWithUserId.userId = jwtToken.userId;
      }

      return sessionWithUserId;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
