import { getSupabase } from "./supabase";
import { isSupabaseConfigured } from "./env";

const BUCKET = "streak-memories";

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

  const ext = extFromUri(params.localUri);
  const safeDate = params.dateStr.replace(/[^0-9-]/g, "");
  const path = `${user.id}/habits/${params.habitId}/${safeDate}.${ext}`;

  const res = await fetch(params.localUri);
  const blob = await res.blob();

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: blob.type || contentTypeForExt(ext),
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

  const ext = extFromUri(params.localUri);
  const path = `${user.id}/mini-missions/${params.miniMissionId}/memory.${ext}`;

  const res = await fetch(params.localUri);
  const blob = await res.blob();

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: blob.type || contentTypeForExt(ext),
  });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) throw new Error("No public URL");
  return pub.publicUrl;
}

export function canUseStreakMemoryUpload(): boolean {
  return isSupabaseConfigured();
}
