import { recordPerfTrace } from "./perfTrace";

type StallProbeOptions = {
  durationMs?: number;
  intervalMs?: number;
  slowMs?: number;
};

export function traceSync<T>(label: string, fn: () => T, slowMs = 24): T {
  const start = Date.now();
  try {
    return fn();
  } finally {
    recordPerfTrace(label, Date.now() - start, { slowMs });
  }
}

/**
 * Watches the JS event loop for stalls for a short window after a suspected-heavy
 * operation starts (e.g. right before a delete/leave-group flow). Call sites fire
 * this and discard the returned stop function — it self-stops after `durationMs`,
 * it isn't meant to be manually torn down.
 */
export function startJsStallProbe(label: string, options: StallProbeOptions = {}): () => void {
  if (!__DEV__) return () => {};
  const intervalMs = options.intervalMs ?? 200;
  const slowMs = options.slowMs ?? intervalMs * 2;
  const durationMs = options.durationMs ?? 4_000;

  let last = Date.now();
  const ticker = setInterval(() => {
    const now = Date.now();
    const drift = now - last - intervalMs;
    if (drift >= slowMs) {
      recordPerfTrace(`${label}.jsStall`, drift, { slowMs, meta: { intervalMs } });
    }
    last = now;
  }, intervalMs);

  const stopTimer = setTimeout(() => clearInterval(ticker), durationMs);

  return () => {
    clearInterval(ticker);
    clearTimeout(stopTimer);
  };
}
