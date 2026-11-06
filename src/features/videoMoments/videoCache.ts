import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Phone-side cache for chapter clips. A clip is downloaded once, the first
 * time someone plays it, and every later play (including replays and other
 * screens) comes from the file on the phone. A clip nobody has played for
 * KEEP_DAYS is deleted, and if the cache grows past MAX_BYTES the least
 * recently played clips go first. Clips are ~0.5-1 MB, so 100 MB is ~100+.
 */
const DIR = `${FileSystem.cacheDirectory ?? ""}chapter-videos/`;
const INDEX_KEY = "chapterVideoCache.v1";
const KEEP_DAYS = 7;
const MAX_BYTES = 100 * 1024 * 1024;

type Entry = { file: string; size: number; lastUsed: number };
type Index = Record<string, Entry>;

let index: Index | null = null;
let pruned = false;
const inFlight = new Map<string, Promise<string>>();

async function loadIndex(): Promise<Index> {
  if (index) return index;
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    index = raw ? (JSON.parse(raw) as Index) : {};
  } catch {
    index = {};
  }
  return index;
}

function saveIndex(): void {
  if (!index) return;
  void AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index)).catch(() => undefined);
}

/** Stable, readable file name from the clip's storage path. */
function fileNameFor(url: string): string {
  const path = url.split("/moment-videos/")[1] ?? url;
  return `${path.replace(/[^a-zA-Z0-9]/g, "_").slice(-120)}.mp4`;
}

async function deleteQuietly(file: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(file, { idempotent: true });
  } catch {
    // Already gone; the OS may clear the cache directory on its own.
  }
}

/** Drops clips unused for KEEP_DAYS, then the oldest ones while over MAX_BYTES. */
export async function pruneChapterVideoCache(now: number = Date.now()): Promise<void> {
  const idx = await loadIndex();
  const cutoff = now - KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const [url, entry] of Object.entries(idx)) {
    if (entry.lastUsed < cutoff) {
      await deleteQuietly(entry.file);
      delete idx[url];
    }
  }
  let total = Object.values(idx).reduce((sum, e) => sum + e.size, 0);
  const oldestFirst = Object.entries(idx).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [url, entry] of oldestFirst) {
    if (total <= MAX_BYTES) break;
    await deleteQuietly(entry.file);
    total -= entry.size;
    delete idx[url];
  }
  saveIndex();
}

/**
 * Local file for a clip: the cached copy if it's still on the phone,
 * otherwise downloaded now and cached. Concurrent calls share one download.
 */
export function cachedChapterVideoUri(url: string): Promise<string> {
  const pending = inFlight.get(url);
  if (pending) return pending;
  const task = (async () => {
    const idx = await loadIndex();
    if (!pruned) {
      pruned = true;
      await pruneChapterVideoCache();
    }
    const known = idx[url];
    if (known) {
      const info = await FileSystem.getInfoAsync(known.file);
      if (info.exists) {
        known.lastUsed = Date.now();
        saveIndex();
        return known.file;
      }
      delete idx[url];
    }
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined);
    const file = `${DIR}${fileNameFor(url)}`;
    const partial = `${file}.part`;
    const res = await FileSystem.downloadAsync(url, partial);
    if (res.status < 200 || res.status >= 300) {
      await deleteQuietly(partial);
      throw new Error(`download failed (${res.status})`);
    }
    await deleteQuietly(file);
    await FileSystem.moveAsync({ from: partial, to: file });
    const info = await FileSystem.getInfoAsync(file);
    idx[url] = { file, size: info.exists ? info.size ?? 0 : 0, lastUsed: Date.now() };
    saveIndex();
    return file;
  })().finally(() => {
    inFlight.delete(url);
  });
  inFlight.set(url, task);
  return task;
}
