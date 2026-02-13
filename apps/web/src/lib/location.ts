// apps/web/src/lib/location.ts

// 经纬度坐标类型
export type Coordinates = {
  latitude: number;
  longitude: number;
};

// ==== 门店坐标配置 ====

// 你的门店：43.760288, -79.412167
const FALLBACK_STORE_COORDINATES: Coordinates = {
  latitude: 43.760288,
  longitude: -79.412167,
};

const parseEnvCoordinate = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// 实际使用的门店坐标（优先用环境变量，没配就用上面的默认）
export const STORE_COORDINATES: Coordinates = {
  latitude: parseEnvCoordinate(
    process.env.NEXT_PUBLIC_STORE_LATITUDE,
    FALLBACK_STORE_COORDINATES.latitude,
  ),
  longitude: parseEnvCoordinate(
    process.env.NEXT_PUBLIC_STORE_LONGITUDE,
    FALLBACK_STORE_COORDINATES.longitude,
  ),
};

// 允许配送半径（单位：km），你可以改大一点
export const DELIVERY_RADIUS_KM = 10;

// ==== 距离计算（haversine）====

const EARTH_RADIUS_KM = 6371;
const toRadians = (value: number) => (value * Math.PI) / 180;

/**
 * 计算两点之间直线距离（km）
 */
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

// ==== 地址解析：调用后端 /location/geocode ====

const geocodeCache = new Map<string, Coordinates>();
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/v1";

/**
 * 调用后端 Nest API，根据地址获取坐标
 * - 成功：返回 { latitude, longitude }
 * - 找不到地址：返回 null
 * - 网络 / 服务器错误：抛异常，让上层 .catch 显示“暂时无法验证地址”
 */
export async function geocodeAddress(
  rawQuery: string,
  options?: { signal?: AbortSignal; cityHint?: string },
): Promise<Coordinates | null> {
  const trimmed = rawQuery.trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase();
  const cityKey = options?.cityHint?.toLowerCase().trim();
  const cacheKey = cityKey ? `${normalized}::${cityKey}` : normalized;

  const cached = geocodeCache.get(cacheKey);
  if (cached) return cached;

  if (!API_BASE_URL) {
    console.warn(
      "[geocodeAddress] NEXT_PUBLIC_API_BASE_URL is empty, cannot call backend geocoding API.",
    );
    return null;
  }

  const query = options?.cityHint ? `${trimmed}, ${options.cityHint}` : trimmed;

  const res = await fetch(`${API_BASE_URL}/location/geocode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      address: query,
      cityHint: options?.cityHint ?? null,
    }),
    signal: options?.signal,
  });

  if (!res.ok) {
    throw new Error(`Geocoding failed (${res.status})`);
  }

  const raw = await res.json();

  // 一些全局响应包装可能是：
  // { code: "SUCCESS", message: "", data: { latitude, longitude } }
  // 或者直接 { latitude, longitude }
  type GeocodeApiResponse =
    | Coordinates
    | { data?: Coordinates | null }
    | { details?: Coordinates | null };

  const hasCoordinates = (value: unknown): value is Coordinates =>
    typeof value === "object" &&
    value !== null &&
    "latitude" in value &&
    "longitude" in value;

  let candidate: GeocodeApiResponse | null = raw as GeocodeApiResponse;

  if (candidate && typeof candidate === "object") {
    // 如果顶层没有 lat/long，但有 data，就优先用 data
    if (!hasCoordinates(candidate) && "data" in candidate && candidate.data) {
      candidate = candidate.data;
    }
    // 有些人喜欢用 details 字段，也顺手兼容一下
    if (!hasCoordinates(candidate) && "details" in candidate && candidate.details) {
      candidate = candidate.details;
    }
  }

  if (!candidate || typeof candidate !== "object" || !hasCoordinates(candidate)) {
    return null;
  }

  const latitude = Number(candidate.latitude);
  const longitude = Number(candidate.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const coordinates: Coordinates = { latitude, longitude };
  geocodeCache.set(cacheKey, coordinates);
  return coordinates;
}
