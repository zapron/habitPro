type StallProbeOptions = {
  durationMs?: number;
  intervalMs?: number;
  slowMs?: number;
};

export function traceSync<T>(label: string, fn: () => T, slowMs = 24): T {
  void label;
  void slowMs;
  return fn();
}

export function startJsStallProbe(label: string, options: StallProbeOptions = {}): () => void {
  void label;
  void options;
  return () => {};
}
