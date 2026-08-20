"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResourceState } from '../types';

export const UBER_RESOURCE_STALE_MS = 30_000;

export function useVisibleResource<T>(enabled: boolean, loader: (signal: AbortSignal) => Promise<T>, initial: T, staleMs = UBER_RESOURCE_STALE_MS) {
  const [data, setData] = useState(initial);
  const [state, setState] = useState<ResourceState>({ loading: false, error: null, lastUpdated: null });
  const fetchedAt = useRef(0);
  const sequence = useRef(0);
  const load = useCallback(async (force = false) => {
    if (!enabled || (!force && Date.now() - fetchedAt.current < staleMs)) return;
    const request = ++sequence.current;
    const controller = new AbortController();
    setState((value) => ({ ...value, loading: true, error: null }));
    try {
      const value = await loader(controller.signal);
      if (request !== sequence.current) return;
      fetchedAt.current = Date.now();
      setData(value);
      setState({ loading: false, error: null, lastUpdated: new Date().toISOString() });
    } catch (error) {
      if (request !== sequence.current || controller.signal.aborted) return;
      setState((value) => ({ ...value, loading: false, error: error instanceof Error ? error.message : '加载失败' }));
    }
    controller.abort();
  }, [enabled, loader, staleMs]);
  useEffect(() => {
    if (!enabled) { sequence.current += 1; return; }
    void load();
    const onVisibility = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', onVisibility);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { sequence.current += 1; window.removeEventListener('focus', onVisibility); document.removeEventListener('visibilitychange', onVisibility); };
  }, [enabled, load]);
  return { data, ...state, retry: () => load(true), refresh: load };
}
