type PerfTraceOptions = {
  slowMs?: number;
  meta?: Record<string, unknown>;
};

export async function traceAsync<T>(
  _label: string,
  fn: () => Promise<T>,
  _options?: PerfTraceOptions,
): Promise<T> {
  return fn();
}
