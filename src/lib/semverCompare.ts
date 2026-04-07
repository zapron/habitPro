/**
 * Compare dotted version strings (e.g. 1.0.0 vs 1.2).
 * Returns negative if a < b, zero if equal, positive if a > b.
 */
export function compareSemver(a: string, b: string): number {
  const parse = (s: string) =>
    s
      .trim()
      .split(/[.+_-]/)
      .map((x) => parseInt(x, 10))
      .map((n) => (Number.isFinite(n) ? n : 0));
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}
