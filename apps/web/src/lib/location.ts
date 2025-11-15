export type Coordinates = {
  latitude: number;
  longitude: number;
};

const FALLBACK_COORDINATES: Coordinates = {
  latitude: 43.653225,
  longitude: -79.383186,
};

const parseEnvCoordinate = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const STORE_COORDINATES: Coordinates = {
  latitude: parseEnvCoordinate(process.env.NEXT_PUBLIC_STORE_LATITUDE, FALLBACK_COORDINATES.latitude),
  longitude: parseEnvCoordinate(process.env.NEXT_PUBLIC_STORE_LONGITUDE, FALLBACK_COORDINATES.longitude),
};

export const DELIVERY_RADIUS_KM = 5;

const EARTH_RADIUS_KM = 6371;

const geocodeCache = new Map<string, Coordinates>();
const GEOCODE_ENDPOINT = "https://geocode.maps.co/search";

const toRadians = (value: number) => (value * Math.PI) / 180;

export function calculateDistanceKm(from: Coordinates, to: Coordinates): number {
  const latDistance = toRadians(to.latitude - from.latitude);
  const lonDistance = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(latDistance / 2) * Math.sin(latDistance / 2) +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(lonDistance / 2) *
      Math.sin(lonDistance / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export async function geocodeAddress(
  rawQuery: string,
  options?: { signal?: AbortSignal; cityHint?: string },
): Promise<Coordinates | null> {
  const trimmed = rawQuery.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase();
  const hint = options?.cityHint ? options.cityHint.toLowerCase().trim() : undefined;
  const cacheKey = hint ? `${normalized}::${hint}` : normalized;
  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;

  const query = options?.cityHint ? `${trimmed}, ${options.cityHint}` : trimmed;

  const url = new URL(GEOCODE_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  url.searchParams.set("format", "json");

  const response = await fetch(url.toString(), {
    method: "GET",
    signal: options?.signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed (${response.status})`);
  }

  const data = (await response.json()) as Array<{ lat: string; lon: string }>;
  const [topResult] = data;
  if (!topResult) return null;

  const latitude = Number(topResult.lat);
  const longitude = Number(topResult.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const coordinates: Coordinates = { latitude, longitude };
  geocodeCache.set(cacheKey, coordinates);
  return coordinates;
}
