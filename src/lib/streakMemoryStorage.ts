import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { getSupabase } from "./supabase";
import { isSupabaseConfigured } from "./env";

const BUCKET = "streak-memories";

const MAX_UPLOAD_WIDTH = 1280;
const UPLOAD_JPEG_QUALITY = 0.82;

async function maybeCompressImageForUpload(localUri: string): Promise<string> {
  // Only attempt manipulations for local URIs (Picker usually returns file://).
  // For other schemes, just upload as-is.
  const isLocal =
    localUri.startsWith("file:") ||
    localUri.startsWith("content:") ||
    (localUri.startsWith("/") && !localUri.startsWith("//"));
  if (!isLocal) return localUri;

  try {
    const res = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: MAX_UPLOAD_WIDTH } }],
      {
        compress: UPLOAD_JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    return res.uri || localUri;
  } catch (resizeErr) {
    // Resize sometimes fails on certain Android content:// sources (some HEIC/scoped-storage
    // cases). Try compressing without resizing before giving up entirely — still shrinks
    // bytes meaningfully even at full resolution, and is more tolerant of odd URI schemes.
    try {
      const res = await ImageManipulator.manipulateAsync(localUri, [], {
        compress: UPLOAD_JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      if (__DEV__) {
        console.warn("[streakMemoryStorage] resize failed, compressed without resize", resizeErr);
      }
      return res.uri || localUri;
    } catch (compressErr) {
      // Last resort: upload the original, uncompressed file rather than fail the memory
      // entirely. Logged because this is exactly the failure mode that lets a multi-MB
      // camera-original slip into Storage instead of the intended ~1280px/q0.82 target.
      if (__DEV__) {
        console.warn("[streakMemoryStorage] compression fully failed, uploading original", compressErr);
      }
      return localUri;
    }
  }
}

/** RN `fetch(fileUri)` often throws "Network request failed" for local URIs; use base64 read instead. */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = globalThis.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Strips embedded ICC color-profile segments (JPEG APP2 markers, marker byte 0xE2) from
 * JPEG bytes. iOS's native image encoder embeds a wide-gamut (commonly Display P3) ICC
 * profile in its output; Android's does not. Some Android image decoders fail to render
 * a JPEG with that profile embedded at all (renders blank), while iOS decodes either
 * version fine natively either way — confirmed by pulling real uploaded files from both
 * platforms and comparing their JPEG markers directly. Stripping the profile only
 * removes the embedded color-space *hint*; pixel data is completely untouched, and
 * decoders fall back to the universally-safe sRGB default. No-ops (returns the input
 * unchanged) for anything that isn't a well-formed JPEG starting with the SOI marker.
 */
function stripIccProfile(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;

  const out: number[] = [0xff, 0xd8];
  let i = 2;
  let changed = false;

  while (i < bytes.length - 1) {
    if (bytes[i] !== 0xff) return bytes; // malformed marker sequence; bail out safely
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    if (marker === 0xda) {
      // Start of scan: the rest of the file is entropy-coded image data (plus EOI) —
      // copy it verbatim, no more markers to inspect.
      for (let j = i; j < bytes.length; j++) out.push(bytes[j]);
      i = bytes.length;
      break;
    }
    if (i + 4 > bytes.length) return bytes; // malformed; bail out safely
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xe2) {
      // APP2 — ICC profile. Drop the segment entirely.
      changed = true;
      i += 2 + length;
      continue;
    }
    for (let j = i; j < i + 2 + length; j++) out.push(bytes[j]);
    i += 2 + length;
  }

  return changed ? new Uint8Array(out) : bytes;
}

/**
 * Load image bytes for upload. Avoids `fetch(localUri)` which breaks on Android/iOS for file/content URIs.
 */
async function readImageBytesForUpload(
  localUri: string,
  defaultContentType: string,
): Promise<{ body: Uint8Array; contentType: string }> {
  if (localUri.startsWith("http://") || localUri.startsWith("https://")) {
    const res = await fetch(localUri);
    if (!res.ok) throw new Error(`Could not load image (${res.status})`);
    const blob = await res.blob();
    const ab = await new Response(blob).arrayBuffer();
    const contentType = blob.type || defaultContentType;
    const body = new Uint8Array(ab);
    return {
      body: contentType === "image/jpeg" ? stripIccProfile(body) : body,
      contentType,
    };
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: "base64",
  });
  const body = base64ToUint8Array(base64);
  return {
    body: defaultContentType === "image/jpeg" ? stripIccProfile(body) : body,
    contentType: defaultContentType,
  };
}

function extFromUri(uri: string): string {
  const m = /\.(jpe?g|png|webp)$/i.exec(uri);
  if (m) return m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
  return "jpg";
}

function contentTypeForExt(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/** True when the URI is a device-local asset that should be uploaded. */
export function shouldUploadLocalStreakImage(uri: string | undefined): boolean {
  if (!uri) return false;
  return (
    uri.startsWith("file:") ||
    uri.startsWith("content:") ||
    uri.startsWith("ph:") ||
    uri.startsWith("asset:") ||
    (uri.startsWith("/") && !uri.startsWith("//"))
  );
}

export type UploadHabitStreakImageParams = {
  habitId: string;
  dateStr: string;
  localUri: string;
};

export type UploadProfileAvatarImageParams = {
  localUri: string;
};

/**
 * Uploads a local image as the signed-in user's profile picture and returns
 * the public URL. Path: `{uid}/avatar.jpg` — `upsert: true` means re-uploading
 * simply overwrites the previous avatar at the same path.
 */
export async function uploadProfileAvatarImage(
  params: UploadProfileAvatarImageParams,
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase not configured");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const uid = user.id.toLowerCase();
  const compressedUri = await maybeCompressImageForUpload(params.localUri);
  const ext = "jpg";
  const path = `${uid}/avatar.${ext}`;
  const ct = contentTypeForExt(ext);
  const { body, contentType } = await readImageBytesForUpload(compressedUri, ct);

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, body, {
    upsert: true,
    contentType,
  });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) throw new Error("No public URL");
  return pub.publicUrl;
}

/**
 * Uploads a local image to Supabase Storage and returns the public URL.
 * Path: `{uid}/habits/{habitId}/{date}.{ext}`
 */
export async function uploadHabitStreakMemoryImage(
  params: UploadHabitStreakImageParams,
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase not configured");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const uid = user.id.toLowerCase();
  const compressedUri = await maybeCompressImageForUpload(params.localUri);
  // We re-encode as JPEG for consistent size/perf.
  const ext = "jpg";
  const safeDate = params.dateStr.replace(/[^0-9-]/g, "");
  const path = `${uid}/habits/${params.habitId}/${safeDate}.${ext}`;
  const ct = contentTypeForExt(ext);
  const { body, contentType } = await readImageBytesForUpload(compressedUri, ct);

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, body, {
    upsert: true,
    contentType,
  });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) throw new Error("No public URL");
  // Same path every upload (`upsert: true`) — append a cache-buster so the
  // CDN/client don't keep showing the previous avatar at this URL.
  return `${pub.publicUrl}?t=${Date.now()}`;
}

export type UploadHabitStreakTaskImageParams = {
  habitId: string;
  dateStr: string;
  taskId: string;
  localUri: string;
};

/**
 * Task-scoped variant of `uploadHabitStreakMemoryImage`, for checklist missions
 * (see docs/CATALOG_ARCHITECTURE.md). Uses a distinct path per task so multiple
 * tasks logged on the same day don't overwrite each other's photo — the plain
 * per-day path above stays untouched and is never called for checklist tasks.
 * Path: `{uid}/habits/{habitId}/{date}/{taskId}.{ext}`
 */
export async function uploadHabitStreakTaskMemoryImage(
  params: UploadHabitStreakTaskImageParams,
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase not configured");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const uid = user.id.toLowerCase();
  const compressedUri = await maybeCompressImageForUpload(params.localUri);
  const ext = "jpg";
  const safeDate = params.dateStr.replace(/[^0-9-]/g, "");
  const safeTaskId = params.taskId.replace(/[^a-zA-Z0-9_-]/g, "");
  const path = `${uid}/habits/${params.habitId}/${safeDate}/${safeTaskId}.${ext}`;
  const ct = contentTypeForExt(ext);
  const { body, contentType } = await readImageBytesForUpload(compressedUri, ct);

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, body, {
    upsert: true,
    contentType,
  });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) throw new Error("No public URL");
  return pub.publicUrl;
}

export type UploadMiniStreakImageParams = {
  miniMissionId: string;
  localUri: string;
};

/**
 * Path: `{uid}/mini-missions/{miniMissionId}/memory.{ext}`
 */
export async function uploadMiniStreakMemoryImage(
  params: UploadMiniStreakImageParams,
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase not configured");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const uid = user.id.toLowerCase();
  const compressedUri = await maybeCompressImageForUpload(params.localUri);
  // We re-encode as JPEG for consistent size/perf.
  const ext = "jpg";
  const path = `${uid}/mini-missions/${params.miniMissionId}/memory.${ext}`;
  const ct = contentTypeForExt(ext);
  const { body, contentType } = await readImageBytesForUpload(compressedUri, ct);

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, body, {
    upsert: true,
    contentType,
  });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) throw new Error("No public URL");
  return pub.publicUrl;
}

export type UploadMiniStreakTaskImageParams = {
  miniMissionId: string;
  taskId: string;
  localUri: string;
};

/**
 * Task-scoped variant of `uploadMiniStreakMemoryImage`, for checklist mini missions
 * (see docs/MINI_MISSION_CATALOG_ARCHITECTURE.md). Uses a distinct path per task so
 * multiple tasks logged for the same mini mission don't overwrite each other's photo
 * — mirrors `uploadHabitStreakTaskMemoryImage`'s pattern exactly.
 * Path: `{uid}/mini-missions/{miniMissionId}/{taskId}.{ext}`
 */
export async function uploadMiniStreakTaskMemoryImage(
  params: UploadMiniStreakTaskImageParams,
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase not configured");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const uid = user.id.toLowerCase();
  const compressedUri = await maybeCompressImageForUpload(params.localUri);
  const ext = "jpg";
  const safeTaskId = params.taskId.replace(/[^a-zA-Z0-9_-]/g, "");
  const path = `${uid}/mini-missions/${params.miniMissionId}/${safeTaskId}.${ext}`;
  const ct = contentTypeForExt(ext);
  const { body, contentType } = await readImageBytesForUpload(compressedUri, ct);

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, body, {
    upsert: true,
    contentType,
  });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) throw new Error("No public URL");
  return pub.publicUrl;
}

async function currentStorageUserPrefix(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ? user.id.toLowerCase() : null;
}

/** Runs async jobs with bounded concurrency so a big batch (e.g. a 365-day mission reset) doesn't open hundreds of requests at once. */
async function runWithConcurrencyLimit<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await run(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Lists everything under a Storage "folder" prefix and returns full paths. Used to find
 * task-scoped photos (`{prefix}/{taskId}.jpg`) without needing to know which task IDs
 * exist from local state — local state can be stale or already cleared by the time a
 * delete/reset runs.
 */
async function listStorageFolder(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  prefix: string,
): Promise<string[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix);
  if (error || !data) return [];
  return data.filter((entry) => entry?.name).map((entry) => `${prefix}/${entry.name}`);
}

/**
 * Removes both the classic per-day file and any task-scoped photos (see
 * `uploadHabitStreakTaskMemoryImage`) for every date given. Task-scoped photos live in
 * a per-date subfolder (`{uid}/habits/{habitId}/{date}/{taskId}.jpg`) that the classic
 * per-day path never touches — before this fix, deleting or resetting a checklist
 * mission left every task photo orphaned in Storage forever. Every call site here is
 * already a background/deferred cleanup (`runAfterSettledInteractions`), so the extra
 * list round-trips (bounded to 12 concurrent) don't block any interactive UI.
 */
export async function deleteHabitStreakMemoryImages(
  habitId: string,
  dateStrs: string[],
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !habitId || dateStrs.length === 0) return;
  const uid = await currentStorageUserPrefix();
  if (!uid) return;

  const safeDates = [...new Set(dateStrs.map((dateStr) => dateStr.replace(/[^0-9-]/g, "")).filter(Boolean))];
  if (safeDates.length === 0) return;

  const classicPaths = safeDates.map((safeDate) => `${uid}/habits/${habitId}/${safeDate}.jpg`);

  const taskPaths: string[] = [];
  await runWithConcurrencyLimit(safeDates, 12, async (safeDate) => {
    const found = await listStorageFolder(supabase, `${uid}/habits/${habitId}/${safeDate}`);
    taskPaths.push(...found);
  });

  const paths = [...new Set([...classicPaths, ...taskPaths])];
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error && __DEV__) {
    console.warn("[habitPro] delete habit memory images failed", error.message);
  }
}

/**
 * Removes every file for one mini mission — the classic `memory.jpg` and any
 * task-scoped photos (see `uploadMiniStreakTaskMemoryImage`), which live flat in the
 * same per-mission folder (no per-date subfolders, unlike habits). Before this fix,
 * only `memory.jpg` was ever removed, orphaning every task photo a checklist mini
 * ever uploaded once the mission was deleted.
 */
export async function deleteMiniStreakMemoryImage(miniMissionId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !miniMissionId) return;
  const uid = await currentStorageUserPrefix();
  if (!uid) return;

  const prefix = `${uid}/mini-missions/${miniMissionId}`;
  const found = await listStorageFolder(supabase, prefix);
  const paths = [...new Set([`${prefix}/memory.jpg`, ...found])];

  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error && __DEV__) {
    console.warn("[habitPro] delete mini memory image failed", error.message);
  }
}

export function canUseStreakMemoryUpload(): boolean {
  return isSupabaseConfigured();
}
