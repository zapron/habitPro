type PerfTraceOptions = {
  slowMs?: number;
  meta?: Record<string, unknown>;
};

const DEFAULT_SLOW_MS = 800;

export async function traceAsync<T>(
  label: string,
  fn: () => Promise<T>,
  options?: PerfTraceOptions,
): Promise<T> {
  if (!__DEV__) return fn();

  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    const elapsedMs = Date.now() - startedAt;
    const slowMs = options?.slowMs ?? DEFAULT_SLOW_MS;
    if (elapsedMs >= slowMs) {
      const suffix = options?.meta ? ` ${JSON.stringify(options.meta)}` : "";
      console.info(`[habitPro:perf] ${label} took ${elapsedMs}ms${suffix}`);
    }
  }
}
