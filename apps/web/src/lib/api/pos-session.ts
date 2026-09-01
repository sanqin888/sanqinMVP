import { ApiError, apiFetch } from "@/lib/api/client";

export type PosSessionSnapshot = {
  sessionExpiresAt?: string | null;
};

export type PosDeviceMetadata = {
  userAgent: string;
  platform: string;
  language: string;
  screen: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
};

export type PosDeviceClaimResult = {
  success: boolean;
  deviceStableId: string;
};

export type PosStoreContext = {
  storeStableId: string;
  storeName: string;
  timezone: string;
};

export async function claimPosDevice(input: {
  enrollmentCode: string;
  meta: PosDeviceMetadata;
}) {
  return apiFetch<PosDeviceClaimResult>("/pos/devices/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    unauthorized: "throw",
  });
}

export async function loginPosSession(input: {
  email: string;
  password: string;
}): Promise<void> {
  await apiFetch<unknown>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, purpose: "pos" }),
    unauthorized: "throw",
  });
}

export async function fetchPosSessionSnapshot(): Promise<PosSessionSnapshot | null> {
  try {
    return await apiFetch<PosSessionSnapshot>("/auth/me", {
      method: "GET",
      keepalive: true,
      unauthorized: "throw",
    });
  } catch (error) {
    // Legacy keepalive treated non-2xx HTTP responses as a quiet
    // "no session update". Keep that behavior while still surfacing a
    // successful response that violates the canonical envelope contract.
    if (
      error instanceof ApiError &&
      (error.status < 200 || error.status >= 300)
    ) {
      return null;
    }
    throw error;
  }
}

export async function fetchPosStoreContext(): Promise<PosStoreContext> {
  return apiFetch<PosStoreContext>("/pos/store-context", {
    unauthorized: "throw",
  });
}

export async function fetchPosHeartbeatSchedule(): Promise<boolean> {
  const status = await apiFetch<{ isOpenBySchedule?: boolean }>(
    "/public/store-status",
    { unauthorized: "throw" },
  );
  return status.isOpenBySchedule === true;
}

export async function postPosConnectivityHeartbeat(): Promise<void> {
  await apiFetch<{ success: true }>("/pos/devices/heartbeat", {
    method: "POST",
    keepalive: true,
    unauthorized: "throw",
  });
}
