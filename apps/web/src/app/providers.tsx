// apps/web/src/app/providers.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  // 这里可以以后再加别的全局 Provider（比如 ThemeProvider）
  return <SessionProvider>{children}</SessionProvider>;
}
