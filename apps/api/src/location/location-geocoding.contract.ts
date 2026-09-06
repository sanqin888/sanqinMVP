export const LOCATION_GEOCODER = Symbol('LOCATION_GEOCODER');

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export interface LocationGeocoderPort {
  geocode(
    rawAddress: string | undefined,
    cityHint?: string,
  ): Promise<Coordinates | null>;
}
