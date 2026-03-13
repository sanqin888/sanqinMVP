"use client";

import { useEffect } from "react";

const KEEP_ALIVE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RENEW_AHEAD_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const LAST_CHECK_STORAGE_KEY = "pos-session-keepalive-last-check-at";
const SESSION_EXPIRES_AT_STORAGE_KEY = "pos-session-expires-at";

type MeResponse = {
  sessionExpiresAt?: string | null;
};

function parseJsonRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  return payload as Record<string, unknown>;
}

function unwrapMeResponse(payload: unknown): MeResponse | null {
  const record = parseJsonRecord(payload);
  if (!record) return null;

  // 兼容 {code,message,details} 信封结构
  if (typeof record.code === "string") {
    const details = parseJsonRecord(record.details);
    if (!details) return null;
    return {
      sessionExpiresAt:
        typeof details.sessionExpiresAt === "string"
          ? details.sessionExpiresAt
          : null,
    };
  }

  return {
    sessionExpiresAt:
      typeof record.sessionExpiresAt === "string"
        ? record.sessionExpiresAt
        : null,
  };
}

function readNumberFromStorage(key: string): number | null {
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function shouldCheckNow(now: number): boolean {
  const lastCheckAt = readNumberFromStorage(LAST_CHECK_STORAGE_KEY);
  const expiresAt = readNumberFromStorage(SESSION_EXPIRES_AT_STORAGE_KEY);

  if (!lastCheckAt) {
    return true;
  }

  if (expiresAt && expiresAt - now < RENEW_AHEAD_WINDOW_MS) {
    return true;
  }

  return now - lastCheckAt >= KEEP_ALIVE_INTERVAL_MS;
}

async function checkSessionIfDue(): Promise<void> {
  const now = Date.now();
  if (!shouldCheckNow(now)) {
    return;
  }

  const response = await fetch("/api/v1/auth/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    keepalive: true,
  });

  if (!response.ok) {
    return;
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const me = unwrapMeResponse(payload);

  window.localStorage.setItem(LAST_CHECK_STORAGE_KEY, String(now));

  if (typeof me?.sessionExpiresAt === "string") {
    const expiresAt = Date.parse(me.sessionExpiresAt);
    if (Number.isFinite(expiresAt) && expiresAt > 0) {
      window.localStorage.setItem(
        SESSION_EXPIRES_AT_STORAGE_KEY,
        String(expiresAt),
      );
    }
  }
}

export function PosSessionKeepAlive() {
  useEffect(() => {
    let disposed = false;

    const tick = () => {
      if (disposed) return;
      void checkSessionIfDue();
    };

    // 每日检查一次；当会话剩余时间 < 3 天时会提前触发，不等到到期。
    tick();

    const intervalId = window.setInterval(tick, KEEP_ALIVE_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
