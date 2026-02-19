// apps/web/src/lib/googleMaps.ts

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      importLibrary?: (libraryName: string) => Promise<unknown>;
      places?: unknown;
    };
  };
};

let mapsPromise: Promise<void> | null = null;

const MAPS_SCRIPT_SELECTOR = "script[data-google-maps='api']";
const MAPS_SCRIPT_PLACES_FALLBACK_SELECTOR =
  "script[data-google-maps='api-places-fallback']";

function getGoogleMapsKey() {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key) {
    throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_KEY is not configured.");
  }
  return key;
}

function hasPlacesApi(windowRef: GoogleMapsWindow) {
  return Boolean(
    windowRef.google?.maps?.importLibrary || windowRef.google?.maps?.places,
  );
}

async function waitForPlacesApi(windowRef: GoogleMapsWindow, timeoutMs = 4000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (hasPlacesApi(windowRef)) {
      return;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
  }
}

async function injectScript(
  selector: string,
  datasetKey: "googleMaps" | "googleMapsFallback",
) {
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${getGoogleMapsKey()}&v=weekly&loading=async&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset[datasetKey] = selector.includes("fallback")
      ? "api-places-fallback"
      : "api";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps script."));
    document.head.appendChild(script);
  });
}

async function injectGoogleMapsScript(windowRef: GoogleMapsWindow) {
  const existingScript = document.querySelector<HTMLScriptElement>(
    MAPS_SCRIPT_SELECTOR,
  );

  if (existingScript) {
    if (hasPlacesApi(windowRef)) {
      return;
    }

    const existingSrc = existingScript.src || "";
    const hasPlacesLibrary =
      existingSrc.includes("libraries=places") ||
      existingSrc.includes("libraries=geometry,places") ||
      existingSrc.includes("libraries=places,") ||
      existingSrc.includes(",places",
    );

    if (hasPlacesLibrary) {
      await new Promise<void>((resolve, reject) => {
        existingScript.addEventListener("load", () => resolve(), {
          once: true,
        });
        existingScript.addEventListener(
          "error",
          () => reject(new Error("Failed to load Google Maps script.")),
          { once: true },
        );
      });
      return;
    }

    const fallbackScript = document.querySelector<HTMLScriptElement>(
      MAPS_SCRIPT_PLACES_FALLBACK_SELECTOR,
    );

    if (!fallbackScript) {
      await injectScript(MAPS_SCRIPT_PLACES_FALLBACK_SELECTOR, "googleMapsFallback");
      return;
    }

    await new Promise<void>((resolve, reject) => {
      fallbackScript.addEventListener("load", () => resolve(), { once: true });
      fallbackScript.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google Maps script.")),
        { once: true },
      );
    });
    return;
  }

  await injectScript(MAPS_SCRIPT_SELECTOR, "googleMaps");
}

export async function loadGoogleMapsPlacesLibrary() {
  if (typeof window === "undefined") {
    throw new Error("Google Maps must be loaded on the client side.");
  }

  const windowRef = window as GoogleMapsWindow;
  if (windowRef.google?.maps?.importLibrary) {
    await windowRef.google.maps.importLibrary("places");
    return;
  }

  if (windowRef.google?.maps?.places) {
    return;
  }

  if (!mapsPromise) {
    mapsPromise = (async () => {
      await injectGoogleMapsScript(windowRef);
      await waitForPlacesApi(windowRef);

      if (windowRef.google?.maps?.importLibrary) {
        await windowRef.google.maps.importLibrary("places");
        return;
      }

      if (!windowRef.google?.maps?.places) {
        throw new Error("Google Maps places library is unavailable.");
      }
    })();
  }

  await mapsPromise;
}
