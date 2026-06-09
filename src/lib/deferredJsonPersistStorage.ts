import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PersistStorage, StorageValue } from "zustand/middleware";

type PendingWrite<S> = {
  value: StorageValue<S>;
  timer: ReturnType<typeof setTimeout>;
  resolve: Array<() => void>;
  reject: Array<(error: unknown) => void>;
};

type Options = {
  delayMs?: number;
};

export function createDeferredJsonPersistStorage<S>(
  options: Options = {},
): PersistStorage<S, Promise<void>> {
  const delayMs = options.delayMs ?? 250;
  const pending = new Map<string, PendingWrite<S>>();

  const flush = async (name: string) => {
    const job = pending.get(name);
    if (!job) return;
    pending.delete(name);

    try {
      const payload = JSON.stringify(job.value);
      await AsyncStorage.setItem(name, payload);
      job.resolve.forEach((resolve) => resolve());
    } catch (error) {
      job.reject.forEach((reject) => reject(error));
    }
  };

  return {
    async getItem(name) {
      const queued = pending.get(name);
      if (queued) return queued.value;
      const raw = await AsyncStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<S>) : null;
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
        queued.resolve.forEach((resolve) => resolve());
      }
      await AsyncStorage.removeItem(name);
    },
  };
}
