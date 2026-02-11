// apps/web/src/components/AddressAutocomplete.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadGoogleMapsPlacesLibrary } from "@/lib/googleMaps";

type AutocompleteSessionToken = {
  readonly __autocompleteSessionToken?: unique symbol;
};

type LatLngConstructor = new (lat: number, lng: number) => unknown;

type AutocompletePredictionRequest = {
  input: string;
  sessionToken: AutocompleteSessionToken;
  componentRestrictions: { country: string };
  types: string[];
  locationBias?: {
    center: unknown;
    radius: number;
  };
};

type AutocompleteService = {
  getPlacePredictions: (
    request: AutocompletePredictionRequest,
    callback: (results: PlacePrediction[] | null, status: string) => void,
  ) => void;
};

type PlaceDetailsRequest = {
  placeId: string;
  fields: string[];
  sessionToken: AutocompleteSessionToken;
};

type PlaceDetailsResult = {
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
  formatted_address?: string;
  address_components?: GooglePlaceComponent[];
};

type PlacesService = {
  getDetails: (
    request: PlaceDetailsRequest,
    callback: (place: PlaceDetailsResult | null, status: string) => void,
  ) => void;
};

type GoogleMapsPlaces = {
  AutocompleteService: new () => AutocompleteService;
  AutocompleteSessionToken: new () => AutocompleteSessionToken;
  PlacesService: new (element: HTMLElement) => PlacesService;
  PlacesServiceStatus: { OK: string };
};

type GoogleMaps = {
  maps: {
    places: GoogleMapsPlaces;
    LatLng: LatLngConstructor;
  };
};

type GooglePlaceComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type PlacePrediction = {
  description: string;
  place_id: string;
  structured_formatting?: {
    main_text: string;
    secondary_text?: string;
  };
};

export type AddressSelection = {
  description: string;
  placeId: string;
  formattedAddress?: string;
  location?: { lat: number; lng: number };
  components?: GooglePlaceComponent[];
  detectedUnit?: string;
};

export type AddressAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (selection: AddressSelection) => void;
  placeholder?: string;
  disabled?: boolean;
  minLength?: number;
  debounceMs?: number;
  country?: string;
  locationBias?: { lat: number; lng: number; radiusMeters: number };
  containerClassName?: string;
  inputClassName?: string;
  suggestionListClassName?: string;
  suggestionItemClassName?: string;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
};

declare global {
  interface Window {
    google?: GoogleMaps;
  }
}

const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_MIN_LENGTH = 3;

const extractUnitNumber = (rawInput: string, selectedAddress: string): string => {
  if (!rawInput) return "";

  const input = rawInput.toLowerCase().trim();
  const address = selectedAddress.toLowerCase().trim();

  const prefixMatch = rawInput.match(/^(\d+)\s*-\s*/);
  if (prefixMatch && prefixMatch[1]) {
    if (!address.startsWith(prefixMatch[1])) {
      return prefixMatch[1];
    }
  }

  const suffixMatch = input.match(
    /(?:#|unit|apt|suite|ste)\.?\s*([a-z0-9-]+)/i,
  );
  if (suffixMatch && suffixMatch[1]) {
    return suffixMatch[1];
  }

  return "";
};

export const extractAddressParts = (selection: AddressSelection) => {
  const components = selection.components ?? [];
  const findComponent = (type: string) =>
    components.find((component) => component.types.includes(type));
  const streetNumber = findComponent("street_number")?.long_name ?? "";
  const route = findComponent("route")?.long_name ?? "";
  const addressLine1 = [streetNumber, route].filter(Boolean).join(" ").trim();
  const city =
    findComponent("locality")?.long_name ??
    findComponent("postal_town")?.long_name ??
    findComponent("sublocality_level_1")?.long_name ??
    "";
  const province = findComponent("administrative_area_level_1")?.short_name ?? "";
  const postalCode = findComponent("postal_code")?.long_name ?? "";

  return {
    addressLine1: addressLine1 || selection.formattedAddress?.split(",")[0] || "",
    city,
    province,
    postalCode,
  };
};

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  disabled,
  minLength = DEFAULT_MIN_LENGTH,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  country = "ca",
  locationBias,
  containerClassName,
  inputClassName,
  suggestionListClassName,
  suggestionItemClassName,
  onBlur,
  onFocus,
}: AddressAutocompleteProps) {
  const [isReady, setIsReady] = useState(false);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [sessionToken, setSessionToken] =
    useState<AutocompleteSessionToken | null>(null);
  const autocompleteServiceRef = useRef<AutocompleteService | null>(null);
  const placesServiceRef = useRef<PlacesService | null>(null);
  const requestIdRef = useRef(0);
  const blurTimeoutRef = useRef<number | null>(null);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    loadGoogleMapsPlacesLibrary()
      .then(() => {
        if (!cancelled) {
          setIsReady(true);
        }
      })
      .catch((error) => {
        console.error("Failed to initialize Google Maps places library", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    const google = window.google;
    if (!google || !google.maps?.places) return;
    if (!autocompleteServiceRef.current) {
      autocompleteServiceRef.current =
        new google.maps.places.AutocompleteService();
    }
    if (!placesServiceRef.current) {
      placesServiceRef.current = new google.maps.places.PlacesService(
        document.createElement("div"),
      );
    }
    if (!sessionToken) {
      setSessionToken(new google.maps.places.AutocompleteSessionToken());
    }
  }, [isReady, sessionToken]);

  useEffect(() => {
    if (!isReady || !autocompleteServiceRef.current) {
      setPredictions([]);
      return;
    }
    const google = window.google;
    if (!google?.maps?.places) {
      setPredictions([]);
      return;
    }

    const trimmed = value.trim();
    if (trimmed.length < minLength) {
      setPredictions([]);
      return;
    }

    if (!isFocusedRef.current) {
      setPredictions([]);
      return;
    }

    if (!sessionToken) {
      const google = window.google;
      if (!google || !google.maps?.places) return;
      setSessionToken(new google.maps.places.AutocompleteSessionToken());
      return;
    }

    const autocompleteService = autocompleteServiceRef.current;
    if (!autocompleteService) {
      setPredictions([]);
      return;
    }
    const requestId = (requestIdRef.current += 1);
    const timeoutId = window.setTimeout(() => {
      const request: AutocompletePredictionRequest = {
        input: trimmed,
        sessionToken,
        componentRestrictions: { country },
        types: ["address"],
      };

      if (locationBias) {
        request.locationBias = {
          center: new google.maps.LatLng(
            locationBias.lat,
            locationBias.lng,
          ),
          radius: locationBias.radiusMeters,
        };
      }

      autocompleteService.getPlacePredictions(
        request,
        (results: PlacePrediction[] | null, status: string) => {
          if (requestId !== requestIdRef.current) return;
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !results
          ) {
            setPredictions([]);
            return;
          }
          setPredictions(results);
        },
      );
    }, debounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [value, minLength, debounceMs, country, locationBias, isReady, sessionToken]);

  const startSessionToken = useCallback(() => {
    if (!isReady) return;
    const google = window.google;
    if (!google?.maps?.places) return;
    setSessionToken(new google.maps.places.AutocompleteSessionToken());
  }, [isReady]);

  const handleSelect = useCallback(
    (prediction: PlacePrediction) => {
      if (blurTimeoutRef.current) {
        window.clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
      setPredictions([]);
      const rawInput = value;
      const detectedUnit = extractUnitNumber(rawInput, prediction.description);
      onChange(prediction.description);

      const placeId = prediction.place_id;
      const currentToken = sessionToken;
      const google = window.google;

      if (!placesServiceRef.current || !currentToken || !google?.maps?.places) {
        onSelect({
          description: prediction.description,
          placeId,
          detectedUnit,
        });
        if (isReady && google?.maps?.places) {
          setSessionToken(new google.maps.places.AutocompleteSessionToken());
        }
        return;
      }

      placesServiceRef.current.getDetails(
        {
          placeId,
          fields: [
            "address_components",
            "geometry",
            "formatted_address",
            "place_id",
          ],
          sessionToken: currentToken,
        },
        (place: PlaceDetailsResult | null, status: string) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK) {
            onSelect({
              description: prediction.description,
              placeId,
              detectedUnit,
            });
          } else {
            const location = place?.geometry?.location
              ? {
                  lat: place.geometry.location.lat(),
                  lng: place.geometry.location.lng(),
                }
              : undefined;
            onSelect({
              description: prediction.description,
              placeId,
              formattedAddress: place?.formatted_address,
              components: place?.address_components ?? [],
              location,
              detectedUnit,
            });
          }
        },
      );

      if (isReady) {
        if (google?.maps?.places) {
          setSessionToken(new google.maps.places.AutocompleteSessionToken());
        }
      }
    },
    [isReady, onChange, onSelect, sessionToken, value],
  );

  return (
    <div className={containerClassName}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={(event) => {
          isFocusedRef.current = true;
          if (!sessionToken && isReady) {
            startSessionToken();
          }
          onFocus?.(event);
        }}
        onBlur={(event) => {
          isFocusedRef.current = false;
          blurTimeoutRef.current = window.setTimeout(() => {
            setPredictions([]);
          }, 150);
          onBlur?.(event);
        }}
        className={inputClassName}
        autoComplete="off"
      />
      {predictions.length > 0 && (
        <ul className={suggestionListClassName}>
          {predictions.map((prediction) => (
            <li
              key={prediction.place_id}
              className={suggestionItemClassName}
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelect(prediction);
              }}
            >
              <span className="font-medium">
                {prediction.structured_formatting?.main_text ??
                  prediction.description}
              </span>
              {prediction.structured_formatting?.secondary_text && (
                <span className="ml-1 text-xs text-slate-500">
                  {prediction.structured_formatting.secondary_text}
                </span>
              )}
            </li>
          ))}
          <li className="flex justify-end p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png"
              alt="Powered by Google"
              className="h-4 object-contain"
            />
          </li>
        </ul>
      )}
    </div>
  );
}
