"use client";

import { useEffect } from "react";

const KEEP_ALIVE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CONNECTIVITY_HEARTBEAT_INTERVAL_MS = 15_000;
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

  if (!lastCheckAt) return true;
  if (expiresAt && expiresAt - now < RENEW_AHEAD_WINDOW_MS) return true;
  return now - lastCheckAt >= KEEP_ALIVE_INTERVAL_MS;
}

async function checkSessionIfDue(): Promise<void> {
  const now = Date.now();
  if (!shouldCheckNow(now)) return;

  const response = await fetch("/api/v1/auth/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    keepalive: true,
  });
  if (!response.ok) return;

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

async function sendConnectivityHeartbeat(): Promise<void> {
  try {
    await fetch("/api/v1/pos/devices/heartbeat", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      keepalive: true,
    });
  } catch {
    // Heartbeats are intentionally silent. The server watchdog logs only
    // connectivity state transitions and failures.
  }
}

export function PosSessionKeepAlive() {
  useEffect(() => {
    let disposed = false;

    const sessionTick = () => {
      if (disposed) return;
      void checkSessionIfDue();
    };
    const heartbeatTick = () => {
      if (disposed) return;
      void sendConnectivityHeartbeat();
    };

    sessionTick();
    heartbeatTick();

    const sessionIntervalId = window.setInterval(
      sessionTick,
      KEEP_ALIVE_INTERVAL_MS,
    );
    const heartbeatIntervalId = window.setInterval(
      heartbeatTick,
      CONNECTIVITY_HEARTBEAT_INTERVAL_MS,
    );

    return () => {
      disposed = true;
      window.clearInterval(sessionIntervalId);
      window.clearInterval(heartbeatIntervalId);
    };
  }, []);

  return null;
}
