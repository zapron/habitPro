type StallProbeOptions = {
  durationMs?: number;
  intervalMs?: number;
  slowMs?: number;
};

export function traceSync<T>(label: string, fn: () => T, slowMs = 24): T {
  if (!__DEV__) return fn();
  const startedAt = Date.now();
  try {
    return fn();
  } finally {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= slowMs) {
      console.info(`[habitPro:js-sync] ${label} took ${elapsedMs}ms`);
    }
  }
}

export function startJsStallProbe(label: string, options: StallProbeOptions = {}): () => void {
  if (!__DEV__) return () => {};

  const durationMs = options.durationMs ?? 6000;
  const intervalMs = options.intervalMs ?? 120;
  const slowMs = options.slowMs ?? 120;
  const startedAt = Date.now();
  let expectedAt = startedAt + intervalMs;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let maxDrift = 0;

  const tick = () => {
    if (stopped) return;
    const now = Date.now();
    const drift = Math.max(0, now - expectedAt);
    maxDrift = Math.max(maxDrift, drift);
    if (drift >= slowMs) {
      console.info(`[habitPro:js-stall] ${label} drift ${drift}ms`);
    }
    if (now - startedAt >= durationMs) {
      if (maxDrift >= slowMs) {
        console.info(`[habitPro:js-stall] ${label} max ${maxDrift}ms`);
      }
      return;
    }
    expectedAt = now + intervalMs;
    timer = setTimeout(tick, intervalMs);
  };

  timer = setTimeout(tick, intervalMs);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
