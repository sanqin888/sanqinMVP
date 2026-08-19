"use client";
import { useEffect } from 'react';
export function useUberPolling(task: () => Promise<void>, intervalMs: number, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let running = false;
    const tick = () => { if (running || document.visibilityState !== 'visible') return; running = true; void task().finally(() => { running = false; }); };
    const timer = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs, task]);
}
