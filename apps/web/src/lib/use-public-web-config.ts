"use client";

import { useEffect, useState } from "react";
import {
  getPublicWebConfig,
  type PublicWebConfig,
} from "@/lib/public-web-config";

type PublicWebConfigState = {
  config: PublicWebConfig | null;
  loading: boolean;
  error: Error | null;
};

export function usePublicWebConfig(): PublicWebConfigState {
  const [state, setState] = useState<PublicWebConfigState>({
    config: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    getPublicWebConfig()
      .then((config) => {
        if (!cancelled) {
          setState({ config, loading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            config: null,
            loading: false,
            error:
              error instanceof Error
                ? error
                : new Error("Public web configuration is unavailable."),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
