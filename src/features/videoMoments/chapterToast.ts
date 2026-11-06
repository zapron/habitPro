import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "chapterUnlockedToast.v1";
let shown: Set<string> | null = null;

/**
 * True the first time a given mission's chapter is seen as unlocked on this
 * phone, so the unlock toast fires once per chapter, not on every visit.
 */
export async function shouldAnnounceChapter(habitId: string, chapter: number): Promise<boolean> {
  if (!shown) {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      shown = new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      shown = new Set();
    }
  }
  const id = `${habitId}:${chapter}`;
  if (shown.has(id)) return false;
  shown.add(id);
  // Keep the list short; old missions' entries don't matter.
  const list = Array.from(shown).slice(-200);
  void AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => undefined);
  return true;
}
