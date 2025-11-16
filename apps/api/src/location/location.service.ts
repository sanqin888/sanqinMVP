import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

interface GoogleGeocodeLocation {
  lat: number;
  lng: number;
}

interface GoogleGeocodeGeometry {
  location?: GoogleGeocodeLocation;
}

interface GoogleGeocodeResult {
  geometry?: GoogleGeocodeGeometry;
}

interface GoogleGeocodeResponse {
  status: string;
  results: GoogleGeocodeResult[];
}

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(private readonly http: HttpService) {}

  async geocode(
    rawAddress: string | undefined,
    cityHint?: string,
  ): Promise<Coordinates | null> {
    // ✅ 防呆：address 可能是 undefined/null
    this.logger.log(
      `Geocoding request: rawAddress=${JSON.stringify(
        rawAddress,
      )}, cityHint=${JSON.stringify(cityHint)}`,
    );

    const trimmed = rawAddress?.trim();
    if (!trimmed) {
      this.logger.warn('LocationService.geocode called with empty address');
      return null;
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      this.logger.error('Missing GOOGLE_MAPS_API_KEY env variable');
      throw new Error('Geocoding is not configured');
    }

    const cleanedCityHint = cityHint?.trim();
    const query = cleanedCityHint ? `${trimmed}, ${cleanedCityHint}` : trimmed;

    const params = new URLSearchParams({
      address: query,
      key: apiKey,
    });

    const { data } = await this.http.axiosRef.get<GoogleGeocodeResponse>(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
    );

    if (!data || data.status !== 'OK' || !data.results?.length) {
      if (data?.status === 'ZERO_RESULTS') {
        this.logger.warn(`ZERO_RESULTS for query="${query}"`);
        return null;
      }
      this.logger.warn(
        `Geocoding failed for "${query}", status: ${data?.status}`,
      );
      throw new Error(
        `Geocoding failed with status ${data?.status ?? 'UNKNOWN'}`,
      );
    }

    const firstResult = data.results[0];
    const loc = firstResult.geometry?.location;
    if (!loc) {
      this.logger.warn(`No geometry.location for query="${query}"`);
      return null;
    }

    const latitude = Number(loc.lat);
    const longitude = Number(loc.lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      this.logger.warn(`Invalid coordinates for query="${query}":`, loc);
      return null;
    }

    this.logger.log(
      `Geocoding success: query="${query}", lat=${latitude}, lng=${longitude}`,
    );

    return { latitude, longitude };
  }
}
