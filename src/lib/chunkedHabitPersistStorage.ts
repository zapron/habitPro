import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PersistStorage, StorageValue } from "zustand/middleware";

type PersistedHabitState = {
  habits?: Array<{ id: string }>;
  miniMissions?: Array<{ id: string }>;
  xp?: number;
  dirtyHabitIds?: string[];
  dirtyMiniMissionIds?: string[];
  pendingDeleteHabitIds?: string[];
  pendingDeleteMiniMissionIds?: string[];
  pendingResetHabitIds?: string[];
  username?: string | null;
};

type Manifest = {
  schema: 2;
  persistVersion?: number;
  habitIds: string[];
  miniMissionIds: string[];
  habitMemoryDates?: Record<string, string[]>;
  xp: number;
  dirtyHabitIds: string[];
  dirtyMiniMissionIds: string[];
  pendingDeleteHabitIds: string[];
  pendingDeleteMiniMissionIds: string[];
  pendingResetHabitIds: string[];
  username: string | null;
  updatedAt: string;
};

type PendingWrite<S> = {
  value: StorageValue<S>;
  timer: ReturnType<typeof setTimeout>;
  resolve: Array<() => void>;
  reject: Array<(error: unknown) => void>;
};

type Options = {
  delayMs?: number;
};

const SCHEMA_VERSION = 2;
const PROCESS_YIELD_EVERY = 6;
const STORAGE_BATCH_SIZE = 12;
const DEFAULT_IDLE_WAIT_TIMEOUT_MS = 2500;

const pendingWriteNames = new Set<string>();
let activeFlushes = 0;
const idleWaiters = new Set<() => void>();

function notifyPersistIdleIfReady() {
  if (pendingWriteNames.size > 0 || activeFlushes > 0) return;
  const waiters = Array.from(idleWaiters);
  idleWaiters.clear();
  waiters.forEach((resolve) => resolve());
}

export function waitForHabitPersistIdle(timeoutMs = DEFAULT_IDLE_WAIT_TIMEOUT_MS): Promise<void> {
  if (pendingWriteNames.size === 0 && activeFlushes === 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      idleWaiters.delete(finish);
      resolve();
    };
    timer = setTimeout(finish, timeoutMs);
    idleWaiters.add(finish);
  });
}

function manifestKey(name: string): string {
  return `${name}:v2:manifest`;
}

function habitKey(name: string, id: string): string {
  return `${name}:v2:habit:${id}`;
}

function miniKey(name: string, id: string): string {
  return `${name}:v2:mini:${id}`;
}

function habitMemoryKey(name: string, habitId: string, date: string): string {
  return `${name}:v2:habit:${habitId}:memory:${date}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isManifest(value: unknown): value is Manifest {
  if (!isRecord(value)) return false;
  return (
    value.schema === SCHEMA_VERSION &&
    Array.isArray(value.habitIds) &&
    Array.isArray(value.miniMissionIds)
  );
}

function uniqueIds(items: Array<{ id: string }> | undefined): string[] {
  if (!items?.length) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    ids.push(item.id);
  }
  return ids;
}

function uniqueStringIds(value: string[] | undefined): string[] {
  if (!value?.length) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of value) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function manifestContent(manifest: Omit<Manifest, "updatedAt">): string {
  return JSON.stringify(manifest);
}

function yieldToJs(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function multiSetInBatches(entries: [string, string][]): Promise<void> {
  for (let i = 0; i < entries.length; i += STORAGE_BATCH_SIZE) {
    await AsyncStorage.multiSet(entries.slice(i, i + STORAGE_BATCH_SIZE));
    if (i + STORAGE_BATCH_SIZE < entries.length) await yieldToJs();
  }
}

async function multiRemoveInBatches(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += STORAGE_BATCH_SIZE) {
    await AsyncStorage.multiRemove(keys.slice(i, i + STORAGE_BATCH_SIZE));
    if (i + STORAGE_BATCH_SIZE < keys.length) await yieldToJs();
  }
}

export function createChunkedHabitPersistStorage<S extends PersistedHabitState>(
  options: Options = {},
): PersistStorage<S, Promise<void>> {
  const delayMs = options.delayMs ?? 250;
  const pending = new Map<string, PendingWrite<S>>();
  const serializedByKey = new Map<string, string>();
  const objectRefByKey = new Map<string, unknown>();
  const serializedManifestContentByName = new Map<string, string>();
  const knownHabitIdsByName = new Map<string, Set<string>>();
  const knownMiniIdsByName = new Map<string, Set<string>>();
  const knownHabitMemoryDatesByName = new Map<string, Map<string, Set<string>>>();

  async function readLegacy(name: string): Promise<StorageValue<S> | null> {
    const raw = await AsyncStorage.getItem(name);
    return parseJson<StorageValue<S>>(raw);
  }

  async function readChunked(name: string): Promise<StorageValue<S> | null> {
    const rawManifest = await AsyncStorage.getItem(manifestKey(name));
    const manifest = parseJson<Manifest>(rawManifest);
    if (!isManifest(manifest)) return null;

    const habitMemoryDates = isRecord(manifest.habitMemoryDates) ? manifest.habitMemoryDates : {};
    const habitKeys = manifest.habitIds.map((id) => habitKey(name, id));
    const habitMemoryKeys = manifest.habitIds.flatMap((id) => {
      const dates = Array.isArray(habitMemoryDates[id]) ? habitMemoryDates[id] : [];
      return dates.map((date) => habitMemoryKey(name, id, date));
    });
    const miniKeys = manifest.miniMissionIds.map((id) => miniKey(name, id));
    const pairs = await AsyncStorage.multiGet([...habitKeys, ...habitMemoryKeys, ...miniKeys]);
    const byKey = new Map(pairs);
    const habits: unknown[] = [];
    const miniMissions: unknown[] = [];
    const knownMemoryDates = new Map<string, Set<string>>();

    for (const id of manifest.habitIds) {
      const key = habitKey(name, id);
      const raw = byKey.get(key) ?? null;
      const item = parseJson<unknown>(raw);
      if (!item) return null;
      const dates = Array.isArray(habitMemoryDates[id]) ? habitMemoryDates[id] : [];
      if (dates.length > 0 && isRecord(item)) {
        const memories: Record<string, unknown> = {};
        for (const date of dates) {
          const memoryKey = habitMemoryKey(name, id, date);
          const rawMemory = byKey.get(memoryKey) ?? null;
          const memory = parseJson<unknown>(rawMemory);
          if (!memory) return null;
          memories[date] = memory;
          serializedByKey.set(memoryKey, rawMemory as string);
          objectRefByKey.set(memoryKey, memory);
        }
        (item as Record<string, unknown>).streakMemories = memories;
        knownMemoryDates.set(id, new Set(dates));
      }
      serializedByKey.set(key, raw as string);
      objectRefByKey.set(key, item);
      habits.push(item);
    }

    for (const id of manifest.miniMissionIds) {
      const key = miniKey(name, id);
      const raw = byKey.get(key) ?? null;
      const item = parseJson<unknown>(raw);
      if (!item) return null;
      serializedByKey.set(key, raw as string);
      objectRefByKey.set(key, item);
      miniMissions.push(item);
    }

    knownHabitIdsByName.set(name, new Set(manifest.habitIds));
    knownMiniIdsByName.set(name, new Set(manifest.miniMissionIds));
    knownHabitMemoryDatesByName.set(name, knownMemoryDates);
    serializedManifestContentByName.set(
      name,
      manifestContent({
        schema: manifest.schema,
        persistVersion: manifest.persistVersion,
        habitIds: manifest.habitIds,
        miniMissionIds: manifest.miniMissionIds,
        habitMemoryDates: manifest.habitMemoryDates,
        xp: manifest.xp,
        dirtyHabitIds: manifest.dirtyHabitIds,
        dirtyMiniMissionIds: manifest.dirtyMiniMissionIds,
        pendingDeleteHabitIds: manifest.pendingDeleteHabitIds ?? [],
        pendingDeleteMiniMissionIds: manifest.pendingDeleteMiniMissionIds ?? [],
        pendingResetHabitIds: manifest.pendingResetHabitIds ?? [],
        username: manifest.username,
      }),
    );

    return {
      state: {
        habits,
        miniMissions,
        xp: manifest.xp,
        dirtyHabitIds: manifest.dirtyHabitIds,
        dirtyMiniMissionIds: manifest.dirtyMiniMissionIds,
        pendingDeleteHabitIds: manifest.pendingDeleteHabitIds ?? [],
        pendingDeleteMiniMissionIds: manifest.pendingDeleteMiniMissionIds ?? [],
        pendingResetHabitIds: manifest.pendingResetHabitIds ?? [],
        username: manifest.username,
      } as S,
      version: manifest.persistVersion,
    };
  }

  async function flush(name: string) {
    const job = pending.get(name);
    if (!job) return;
    pending.delete(name);
    pendingWriteNames.delete(name);
    activeFlushes += 1;

    try {
      const state = (job.value.state ?? {}) as PersistedHabitState;
      const habits = state.habits ?? [];
      const miniMissions = state.miniMissions ?? [];
      const habitIds = uniqueIds(habits);
      const miniMissionIds = uniqueIds(miniMissions);
      const habitIdSet = new Set(habitIds);
      const miniIdSet = new Set(miniMissionIds);
      const habitMemoryDates: Record<string, string[]> = {};
      const nextKnownMemoryDates = new Map<string, Set<string>>();
      const writes: [string, string][] = [];
      const removals: string[] = [];
      let processedItems = 0;

      for (const habit of habits) {
        if (!habit?.id) continue;
        const habitRecord = habit as Record<string, unknown>;
        const rawMemories = isRecord(habitRecord.streakMemories) ? habitRecord.streakMemories : null;
        const memoryDates = rawMemories ? Object.keys(rawMemories) : [];
        const memoryDateSet = new Set(memoryDates);
        if (memoryDates.length > 0) {
          habitMemoryDates[habit.id] = memoryDates;
        }
        nextKnownMemoryDates.set(habit.id, memoryDateSet);

        const key = habitKey(name, habit.id);
        const { streakMemories: _streakMemories, ...habitWithoutMemories } = habitRecord;
        const serialized = JSON.stringify(habitWithoutMemories);
        if (serializedByKey.get(key) !== serialized) {
          writes.push([key, serialized]);
          serializedByKey.set(key, serialized);
        }
        objectRefByKey.set(key, habitWithoutMemories);

        if (rawMemories) {
          for (const date of memoryDates) {
            const memory = rawMemories[date];
            const memoryKey = habitMemoryKey(name, habit.id, date);
            if (objectRefByKey.get(memoryKey) === memory && serializedByKey.has(memoryKey)) continue;
            const serializedMemory = JSON.stringify(memory);
            if (serializedByKey.get(memoryKey) !== serializedMemory) {
              writes.push([memoryKey, serializedMemory]);
              serializedByKey.set(memoryKey, serializedMemory);
            }
            objectRefByKey.set(memoryKey, memory);
            processedItems += 1;
            if (processedItems % PROCESS_YIELD_EVERY === 0) await yieldToJs();
          }
        }

        const previousMemoryDates = knownHabitMemoryDatesByName.get(name)?.get(habit.id) ?? new Set<string>();
        for (const date of previousMemoryDates) {
          if (memoryDateSet.has(date)) continue;
          const memoryKey = habitMemoryKey(name, habit.id, date);
          removals.push(memoryKey);
          serializedByKey.delete(memoryKey);
          objectRefByKey.delete(memoryKey);
        }
        processedItems += 1;
        if (processedItems % PROCESS_YIELD_EVERY === 0) await yieldToJs();
      }

      for (const mission of miniMissions) {
        if (!mission?.id) continue;
        const key = miniKey(name, mission.id);
        if (objectRefByKey.get(key) === mission && serializedByKey.has(key)) continue;
        const serialized = JSON.stringify(mission);
        if (serializedByKey.get(key) !== serialized) {
          writes.push([key, serialized]);
          serializedByKey.set(key, serialized);
        }
        objectRefByKey.set(key, mission);
        processedItems += 1;
        if (processedItems % PROCESS_YIELD_EVERY === 0) await yieldToJs();
      }

      for (const id of knownHabitIdsByName.get(name) ?? []) {
        if (habitIdSet.has(id)) continue;
        const key = habitKey(name, id);
        removals.push(key);
        serializedByKey.delete(key);
        objectRefByKey.delete(key);
        const previousMemoryDates = knownHabitMemoryDatesByName.get(name)?.get(id) ?? new Set<string>();
        for (const date of previousMemoryDates) {
          const memoryKey = habitMemoryKey(name, id, date);
          removals.push(memoryKey);
          serializedByKey.delete(memoryKey);
          objectRefByKey.delete(memoryKey);
        }
      }

      for (const id of knownMiniIdsByName.get(name) ?? []) {
        if (miniIdSet.has(id)) continue;
        const key = miniKey(name, id);
        removals.push(key);
        serializedByKey.delete(key);
        objectRefByKey.delete(key);
      }

      if (writes.length > 0) await multiSetInBatches(writes);
      if (removals.length > 0) await multiRemoveInBatches(removals);

      const manifestBody: Omit<Manifest, "updatedAt"> = {
        schema: SCHEMA_VERSION,
        persistVersion: job.value.version,
        habitIds,
        miniMissionIds,
        habitMemoryDates,
        xp: typeof state.xp === "number" ? state.xp : 0,
        dirtyHabitIds: state.dirtyHabitIds ?? [],
        dirtyMiniMissionIds: state.dirtyMiniMissionIds ?? [],
        pendingDeleteHabitIds: uniqueStringIds(state.pendingDeleteHabitIds),
        pendingDeleteMiniMissionIds: uniqueStringIds(state.pendingDeleteMiniMissionIds),
        pendingResetHabitIds: uniqueStringIds(state.pendingResetHabitIds),
        username: typeof state.username === "string" ? state.username : null,
      };
      const serializedManifestContent = manifestContent(manifestBody);
      const manifest: Manifest = {
        ...manifestBody,
        updatedAt: new Date().toISOString(),
      };
      const serializedManifest = JSON.stringify(manifest);
      if (
        writes.length > 0 ||
        removals.length > 0 ||
        serializedManifestContentByName.get(name) !== serializedManifestContent
      ) {
        await AsyncStorage.setItem(manifestKey(name), serializedManifest);
        serializedManifestContentByName.set(name, serializedManifestContent);
      }
      knownHabitIdsByName.set(name, habitIdSet);
      knownMiniIdsByName.set(name, miniIdSet);
      knownHabitMemoryDatesByName.set(name, nextKnownMemoryDates);
      job.resolve.forEach((resolve) => resolve());
    } catch (error) {
      job.reject.forEach((reject) => reject(error));
    } finally {
      activeFlushes = Math.max(0, activeFlushes - 1);
      notifyPersistIdleIfReady();
    }
  }

  return {
    async getItem(name) {
      const queued = pending.get(name);
      if (queued) return queued.value;
      return (await readChunked(name)) ?? (await readLegacy(name));
    },
    setItem(name, value) {
      const previous = pending.get(name);
      if (previous) {
        clearTimeout(previous.timer);
        previous.resolve.forEach((resolve) => resolve());
      }

      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          void flush(name);
        }, delayMs);
        pendingWriteNames.add(name);
        pending.set(name, {
          value,
          timer,
          resolve: [resolve],
          reject: [reject],
        });
      });
    },
    async removeItem(name) {
      const queued = pending.get(name);
      if (queued) {
        clearTimeout(queued.timer);
        pending.delete(name);
        pendingWriteNames.delete(name);
        queued.resolve.forEach((resolve) => resolve());
        notifyPersistIdleIfReady();
      }
      const rawManifest = await AsyncStorage.getItem(manifestKey(name));
      const manifest = parseJson<Manifest>(rawManifest);
      const keys = [name, manifestKey(name)];
      if (isManifest(manifest)) {
        keys.push(...manifest.habitIds.map((id) => habitKey(name, id)));
        const memoryDates = isRecord(manifest.habitMemoryDates) ? manifest.habitMemoryDates : {};
        for (const id of manifest.habitIds) {
          const dates = Array.isArray(memoryDates[id]) ? memoryDates[id] : [];
          keys.push(...dates.map((date) => habitMemoryKey(name, id, date)));
        }
        keys.push(...manifest.miniMissionIds.map((id) => miniKey(name, id)));
      }
      await AsyncStorage.multiRemove(keys);
      knownHabitIdsByName.delete(name);
      knownMiniIdsByName.delete(name);
      knownHabitMemoryDatesByName.delete(name);
      serializedManifestContentByName.delete(name);
    },
  };
}
