export type PerfTraceEntry = {
  label: string;
  durationMs: number;
  slow: boolean;
  meta?: Record<string, unknown>;
  at: number;
};

const MAX_ENTRIES = 50;
const recentTraces: PerfTraceEntry[] = [];

/** Shared by perfTrace.ts and jsThreadProbe.ts so both traceAsync and traceSync
 * land in the same ring buffer — getRecentPerfTraces() shows a unified timeline. */
export function recordPerfTrace(
  label: string,
  durationMs: number,
  options?: { slowMs?: number; meta?: Record<string, unknown> },
): void {
  const slow = options?.slowMs != null && durationMs >= options.slowMs;
  recentTraces.push({ label, durationMs, slow, meta: options?.meta, at: Date.now() });
  if (recentTraces.length > MAX_ENTRIES) recentTraces.shift();
  if (__DEV__) {
    const ms = durationMs.toFixed(1);
    const tag = slow ? "[habitPro:perf][SLOW]" : "[habitPro:perf]";
    if (options?.meta) {
      console.log(`${tag} ${label}: ${ms}ms`, options.meta);
    } else {
      console.log(`${tag} ${label}: ${ms}ms`);
    }
  }
}

/** Last ~50 traces (traceAsync + traceSync combined), newest last. Read this from a
 * debug screen/console after reproducing a slow path instead of scrolling logs. */
export function getRecentPerfTraces(): PerfTraceEntry[] {
  return [...recentTraces];
}

export function clearRecentPerfTraces(): void {
  recentTraces.length = 0;
}

type PerfTraceOptions = {
  slowMs?: number;
  meta?: Record<string, unknown>;
};

export async function traceAsync<T>(
  label: string,
  fn: () => Promise<T>,
  options?: PerfTraceOptions,
): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    recordPerfTrace(label, Date.now() - start, options);
  }
}
