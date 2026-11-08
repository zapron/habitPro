import * as FileSystem from "expo-file-system/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";
import { Video as VideoCompressor } from "react-native-compressor";
import { getSupabase } from "../../lib/supabase";
import type { ClaimedChapter, VideoMomentCredit } from "./credit";

const BUCKET = "moment-videos";
/** Same cap as the bucket and moment_videos (2 MB). */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Chapters of this mission whose video was already used (moment_videos rows). */
export async function fetchClaimedChapters(habitId: string): Promise<ClaimedChapter[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("moment_videos")
    .select("block_number, start_date")
    .eq("habit_id", habitId);
  if (error || !data) return [];
  return (data as { block_number: number; start_date: string }[]).map((r) => ({
    blockNumber: r.block_number,
    startDateKey: r.start_date,
  }));
}

function toFileUri(path: string): string {
  return path.startsWith("file://") || path.startsWith("content://") ? path : `file://${path}`;
}

async function readBytes(uri: string): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  const bin = globalThis.atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const CLAIM_ERRORS: Record<string, string> = {
  feature_disabled: "Chapters aren't available right now.",
  premium_required: "Chapters are part of HabitPro Community.",
  mission_not_eligible: "Chapters start with missions begun after the feature launched.",
  block_not_complete: "Each of these 7 days needs to be done first.",
  block_has_repair: "A repaired day in these 7 days means no chapter this time.",
  not_enough_posts: "You need 3 Community posts from these 7 days.",
  outside_window: "This chapter had to be used within 7 days of earning it.",
  already_claimed: "You've already used this chapter.",
  video_too_large: "That clip is too large. Record a shorter one and try again.",
  video_not_uploaded: "The video didn't finish uploading. Try again.",
};

export type VideoMomentUploadResult = { videoUrl: string; posterUrl: string };

/**
 * Compresses the clip on the phone (silent, ~960px, ~1 Mbps), grabs a poster frame, uploads
 * both to the moment-videos bucket and claims the credit on the server, which
 * re-checks the unlock rules. Throws a readable Error on any failure.
 */
export async function uploadAndClaimVideoMoment(params: {
  habitId: string;
  credit: VideoMomentCredit;
  localUri: string;
  durationMs: number;
}): Promise<VideoMomentUploadResult> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud sync isn't configured.");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save a video moment.");

  // stripAudio removes the sound track from the file itself (both platforms),
  // so no clip ever carries audio.
  const compressedPath = await VideoCompressor.compress(params.localUri, {
    compressionMethod: "manual",
    maxSize: 960,
    bitrate: 1_000_000,
    stripAudio: true,
  });
  const compressedUri = toFileUri(compressedPath);
  const poster = await VideoThumbnails.getThumbnailAsync(compressedUri, { time: 0, quality: 0.7 });

  const uid = user.id.toLowerCase();
  const base = `${uid}/${params.habitId}/${params.credit.block.blockNumber}`;
  const videoPath = `${base}.mp4`;
  const posterPath = `${base}.jpg`;

  const [videoBytes, posterBytes] = await Promise.all([readBytes(compressedUri), readBytes(poster.uri)]);
  if (videoBytes.length > MAX_UPLOAD_BYTES) {
    throw new Error(CLAIM_ERRORS.video_too_large);
  }
  const bucket = supabase.storage.from(BUCKET);
  const [videoUp, posterUp] = await Promise.all([
    bucket.upload(videoPath, videoBytes, { upsert: true, contentType: "video/mp4" }),
    bucket.upload(posterPath, posterBytes, { upsert: true, contentType: "image/jpeg" }),
  ]);
  if (videoUp.error) throw new Error(videoUp.error.message);
  if (posterUp.error) throw new Error(posterUp.error.message);

  const { error } = await supabase.rpc("rpc_claim_video_moment_v1", {
    p_habit_id: params.habitId,
    p_block_number: params.credit.block.blockNumber,
    p_block_date_keys: params.credit.block.dateKeys,
    p_mission_day: params.credit.missionDay,
    p_date_key: params.credit.dateKey,
    p_video_path: videoPath,
    p_poster_path: posterPath,
    p_duration_ms: Math.max(1, Math.round(params.durationMs)),
    p_size_bytes: videoBytes.length,
  });
  if (error) {
    const key = Object.keys(CLAIM_ERRORS).find((k) => error.message.includes(k));
    throw new Error(key ? CLAIM_ERRORS[key] : error.message);
  }

  // No cache-buster query: the server matches post video URLs by path, and a
  // block's path is only ever written once.
  return {
    videoUrl: bucket.getPublicUrl(videoPath).data.publicUrl,
    posterUrl: bucket.getPublicUrl(posterPath).data.publicUrl,
  };
}
