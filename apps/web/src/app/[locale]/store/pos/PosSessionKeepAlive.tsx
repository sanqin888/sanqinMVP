"use client";

import { useEffect } from "react";

const KEEP_ALIVE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CONNECTIVITY_HEARTBEAT_INTERVAL_MS = 15_000;
const STORE_SCHEDULE_CHECK_INTERVAL_MS = 60_000;
const RENEW_AHEAD_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const LAST_CHECK_STORAGE_KEY = "pos-session-keepalive-last-check-at";
const SESSION_EXPIRES_AT_STORAGE_KEY = "pos-session-expires-at";

type MeResponse = {
  sessionExpiresAt?: string | null;
};

type StoreStatusResponse = {
  isOpenBySchedule?: boolean;
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

function unwrapStoreStatus(payload: unknown): StoreStatusResponse | null {
  const record = parseJsonRecord(payload);
  if (!record) return null;
  const source =
    typeof record.code === "string" ? parseJsonRecord(record.details) : record;
  if (!source) return null;
  return {
    isOpenBySchedule:
      typeof source.isOpenBySchedule === "boolean"
        ? source.isOpenBySchedule
        : undefined,
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

async function fetchHeartbeatSchedule(): Promise<boolean> {
  const response = await fetch("/api/v1/public/store-status", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return false;
  const payload = (await response.json().catch(() => null)) as unknown;
  return unwrapStoreStatus(payload)?.isOpenBySchedule === true;
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
    let heartbeatEnabled = false;

    const sessionTick = () => {
      if (disposed) return;
      void checkSessionIfDue();
    };
    const heartbeatTick = () => {
      if (disposed || !heartbeatEnabled) return;
      void sendConnectivityHeartbeat();
    };
    const scheduleTick = async () => {
      if (disposed) return;
      try {
        const enabled = await fetchHeartbeatSchedule();
        if (disposed) return;
        const justEnabled = enabled && !heartbeatEnabled;
        heartbeatEnabled = enabled;
        if (justEnabled) heartbeatTick();
      } catch {
        heartbeatEnabled = false;
      }
    };

    sessionTick();
    void scheduleTick();

    const sessionIntervalId = window.setInterval(
      sessionTick,
      KEEP_ALIVE_INTERVAL_MS,
    );
    const heartbeatIntervalId = window.setInterval(
      heartbeatTick,
      CONNECTIVITY_HEARTBEAT_INTERVAL_MS,
    );
    const scheduleIntervalId = window.setInterval(
      () => void scheduleTick(),
      STORE_SCHEDULE_CHECK_INTERVAL_MS,
    );

    return () => {
      disposed = true;
      window.clearInterval(sessionIntervalId);
      window.clearInterval(heartbeatIntervalId);
      window.clearInterval(scheduleIntervalId);
    };
  }, []);

  return null;
}
