/** Normalize handle for storage (lowercase, trimmed). */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(
  raw: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const v = normalizeUsername(raw);
  if (v.length === 0) {
    return { ok: false, message: "Enter a username." };
  }
  if (v.length < 3) {
    return { ok: false, message: "Use at least 3 characters." };
  }
  if (v.length > 20) {
    return { ok: false, message: "Use at most 20 characters." };
  }
  if (!/^[a-z0-9_]+$/.test(v)) {
    return { ok: false, message: "Use letters, numbers, and underscores only." };
  }
  return { ok: true, value: v };
}
