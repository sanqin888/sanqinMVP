// apps/web/src/lib/googleMaps.ts

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      importLibrary?: (libraryName: string) => Promise<unknown>;
    };
  };
};

let mapsPromise: Promise<void> | null = null;

const MAPS_SCRIPT_SELECTOR = "script[data-google-maps='api']";

function getGoogleMapsKey() {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key) {
    throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_KEY is not configured.");
  }
  return key;
}

async function injectGoogleMapsScript(windowRef: GoogleMapsWindow) {
  const existingScript = document.querySelector<HTMLScriptElement>(
    MAPS_SCRIPT_SELECTOR,
  );

  if (existingScript) {
    if (windowRef.google?.maps?.importLibrary) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google Maps script.")),
        { once: true },
      );
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${getGoogleMapsKey()}&v=weekly&loading=async`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "api";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps script."));
    document.head.appendChild(script);
  });
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

  if (!mapsPromise) {
    mapsPromise = (async () => {
      await injectGoogleMapsScript(windowRef);

      if (!windowRef.google?.maps?.importLibrary) {
        throw new Error("Google Maps importLibrary is unavailable.");
      }

      await windowRef.google.maps.importLibrary("places");
    })();
  }

  await mapsPromise;
}
