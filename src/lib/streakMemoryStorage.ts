import * as FileSystem from "expo-file-system/legacy";
import { getSupabase } from "./supabase";
import { isSupabaseConfigured } from "./env";

const BUCKET = "streak-memories";

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
  const ext = extFromUri(params.localUri);
  const safeDate = params.dateStr.replace(/[^0-9-]/g, "");
  const path = `${uid}/habits/${params.habitId}/${safeDate}.${ext}`;
  const ct = contentTypeForExt(ext);
  const { body, contentType } = await readImageBytesForUpload(params.localUri, ct);

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
  const ext = extFromUri(params.localUri);
  const path = `${uid}/mini-missions/${params.miniMissionId}/memory.${ext}`;
  const ct = contentTypeForExt(ext);
  const { body, contentType } = await readImageBytesForUpload(params.localUri, ct);

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, body, {
    upsert: true,
    contentType,
  });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) throw new Error("No public URL");
  return pub.publicUrl;
}

export function canUseStreakMemoryUpload(): boolean {
  return isSupabaseConfigured();
}
