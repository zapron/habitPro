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
  } catch {
    // Best-effort: if compression fails (some Android content URIs), fall back to original.
    return localUri;
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
    return {
      body: new Uint8Array(ab),
      contentType: blob.type || defaultContentType,
    };
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: "base64",
  });
  return {
    body: base64ToUint8Array(base64),
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

async function currentStorageUserPrefix(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ? user.id.toLowerCase() : null;
}

export async function deleteHabitStreakMemoryImages(
  habitId: string,
  dateStrs: string[],
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !habitId || dateStrs.length === 0) return;
  const uid = await currentStorageUserPrefix();
  if (!uid) return;

  const paths = [
    ...new Set(
      dateStrs
        .map((dateStr) => dateStr.replace(/[^0-9-]/g, ""))
        .filter(Boolean)
        .map((safeDate) => `${uid}/habits/${habitId}/${safeDate}.jpg`),
    ),
  ];
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error && __DEV__) {
    console.warn("[habitPro] delete habit memory images failed", error.message);
  }
}

export async function deleteMiniStreakMemoryImage(miniMissionId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !miniMissionId) return;
  const uid = await currentStorageUserPrefix();
  if (!uid) return;

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([`${uid}/mini-missions/${miniMissionId}/memory.jpg`]);
  if (error && __DEV__) {
    console.warn("[habitPro] delete mini memory image failed", error.message);
  }
}

export function canUseStreakMemoryUpload(): boolean {
  return isSupabaseConfigured();
}
