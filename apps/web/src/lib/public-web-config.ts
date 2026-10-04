import { apiFetch } from "@/lib/api/client";

export type PublicWebConfig = {
  store: {
    storeStableId: string;
    latitude: number;
    longitude: number;
  };
  maps: {
    browserKey: string;
  };
};

let publicWebConfigPromise: Promise<PublicWebConfig> | null = null;

export function parsePublicWebConfig(payload: unknown): PublicWebConfig {
  if (!payload || typeof payload !== "object") {
    throw new Error("Public web configuration is invalid.");
  }

  const candidate = payload as {
    store?: {
      storeStableId?: unknown;
      latitude?: unknown;
      longitude?: unknown;
    };
    maps?: {
      browserKey?: unknown;
    };
  };

  const storeStableId =
    typeof candidate.store?.storeStableId === "string"
      ? candidate.store.storeStableId.trim()
      : "";
  const latitude = candidate.store?.latitude;
  const longitude = candidate.store?.longitude;
  const browserKey =
    typeof candidate.maps?.browserKey === "string"
      ? candidate.maps.browserKey.trim()
      : "";

  if (
    !storeStableId ||
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !browserKey
  ) {
    throw new Error("Public web configuration is invalid.");
  }

  return {
    store: {
      storeStableId,
      latitude,
      longitude,
    },
    maps: {
      browserKey,
    },
  };
}

export function getPublicWebConfig(): Promise<PublicWebConfig> {
  if (!publicWebConfigPromise) {
    publicWebConfigPromise = apiFetch<unknown>("/public/web-config")
      .then(parsePublicWebConfig)
      .catch((error) => {
        publicWebConfigPromise = null;
        throw error;
      });
  }

  return publicWebConfigPromise;
}
