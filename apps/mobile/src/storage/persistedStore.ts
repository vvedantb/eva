import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { z } from "zod";

const device =
  Platform.OS === "web"
    ? {
        get: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
        set: async (key: string, value: string) => globalThis.localStorage?.setItem(key, value),
      }
    : { get: SecureStore.getItemAsync, set: SecureStore.setItemAsync };

/**
 * Values by key that every screen reads, so screens on different routes share
 * them. One listener set: a write re-renders the readers, and each re-reads
 * only its own key.
 */
export function keyedStore<T>(fallback: T) {
  const values = new Map<string, T>();
  const listeners = new Set<() => void>();
  const get = (key: string) => values.get(key) ?? fallback;
  const set = (key: string, value: T) => {
    values.set(key, value);
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const useValue = (key: string) => useSyncExternalStore(subscribe, () => get(key));
  return { get, set, has: (key: string) => values.has(key), subscribe, useValue };
}

/**
 * A `keyedStore` kept on the device: each key is restored the first time a
 * screen reads it, and every change is written back. Until the restore lands
 * the reader sees `fallback`; a change made while it is in flight wins.
 */
export function persistedStore<T>(name: string, fallback: T, parse: (raw: string) => T | null) {
  const store = keyedStore(fallback);
  const restored = new Set<string>();
  const storageKey = (key: string) => `eva.${name}.${key}`;
  const restore = (key: string) => {
    if (restored.has(key)) return;
    restored.add(key);
    device
      .get(storageKey(key))
      .then((raw) => {
        const value = raw === null ? null : parse(raw);
        if (value !== null && !store.has(key)) store.set(key, value);
      })
      .catch(() => undefined);
  };
  return {
    get: store.get,
    set: (key: string, value: T) => {
      store.set(key, value);
      device.set(storageKey(key), JSON.stringify(value)).catch(() => undefined);
    },
    useValue: (key: string) =>
      useSyncExternalStore(
        (listener) => {
          restore(key);
          return store.subscribe(listener);
        },
        () => store.get(key),
      ),
  };
}

/** Parses a stored value with `schema`; null when it is not JSON or not that shape (a value from an older build). */
export function jsonParser<T>(schema: z.ZodType<T>) {
  return (raw: string): T | null => {
    try {
      const parsed = schema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };
}

const idList = z.array(z.string());

/** A set of ids kept on the device per `key` (folded groups, say), as the web's open-group maps. */
export function persistedIdSet(name: string) {
  const store = persistedStore<readonly string[]>(name, [], jsonParser(idList));
  return {
    useSet: (key: string): [ReadonlySet<string>, (id: string) => void] => {
      const ids = store.useValue(key);
      const toggle = (id: string) => {
        const current = store.get(key);
        store.set(key, current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
      };
      return [new Set(ids), toggle];
    },
  };
}
