"use client";

import { useEffect } from "react";
import {
  fetchPosHeartbeatSchedule,
  fetchPosSessionSnapshot,
  postPosConnectivityHeartbeat,
} from "@/lib/api/pos-session";

const KEEP_ALIVE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CONNECTIVITY_HEARTBEAT_INTERVAL_MS = 15_000;
const STORE_SCHEDULE_CHECK_INTERVAL_MS = 60_000;
const RENEW_AHEAD_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const LAST_CHECK_STORAGE_KEY = "pos-session-keepalive-last-check-at";
const SESSION_EXPIRES_AT_STORAGE_KEY = "pos-session-expires-at";

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

  const me = await fetchPosSessionSnapshot();
  if (!me) return;

  window.localStorage.setItem(LAST_CHECK_STORAGE_KEY, String(now));

  if (typeof me.sessionExpiresAt === "string") {
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
    await postPosConnectivityHeartbeat();
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
        const enabled = await fetchPosHeartbeatSchedule();
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
