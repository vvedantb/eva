import { toast } from "@vvedantb/native-ui/toast";
import { useEffect, useState } from "react";

export type ActionResult<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  /** `refreshing` keeps the data on screen while a reload runs. */
  | { status: "ready"; data: T; refreshing: boolean };

type Settled<T> = { key: string; result: { status: "error"; message: string } | { status: "ready"; data: T } };

/**
 * Reads a Convex action once per `key`. The Reviews reads are GitHub calls
 * behind actions, not subscriptions; the web reads them through TanStack
 * Query, which the phone does not have. `key` names every input `load`
 * reads, and null skips the read. `reload` reads again with `force` (past the
 * server ActionCache, as the web Refresh) and keeps the data on screen
 * meanwhile; if it fails, the data stays and `fallback` (or GitHub's message)
 * shows in a toast.
 */
export function useActionResult<T>(
  key: string | null,
  load: (force: boolean) => Promise<T>,
  fallback: string,
): { state: ActionResult<T>; reload: () => void } {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [refreshingKey, setRefreshingKey] = useState<string | null>(null);

  // A reload that lands after the key moved on keeps the newer key's result.
  const settle = (next: Settled<T>) =>
    setSettled((previous) => (previous !== null && previous.key !== next.key ? previous : next));
  const failure = (keyed: string, cause: Error): Settled<T> => ({
    key: keyed,
    result: { status: "error", message: cause.message || fallback },
  });

  // An effect because an action read has no query to subscribe to: one read per key.
  useEffect(() => {
    if (key === null) return;
    let live = true;
    load(false).then(
      (data) => {
        if (live) setSettled({ key, result: { status: "ready", data } });
      },
      (cause: Error) => {
        if (live) setSettled(failure(key, cause));
      },
    );
    return () => {
      live = false;
    };
    // `key` names every input of `load`, which is a new closure each render.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [key]);

  const current = settled?.key === key ? settled.result : null;

  const reload = () => {
    if (key === null) return;
    const hadData = current?.status === "ready";
    if (!hadData) setSettled(null);
    setRefreshingKey(key);
    load(true).then(
      (data) => {
        setRefreshingKey(null);
        settle({ key, result: { status: "ready", data } });
      },
      (cause: Error) => {
        setRefreshingKey(null);
        if (hadData) toast.error(cause.message || fallback);
        else settle(failure(key, cause));
      },
    );
  };

  const state: ActionResult<T> =
    current === null
      ? { status: "loading" }
      : current.status === "error"
        ? current
        : { status: "ready", data: current.data, refreshing: refreshingKey === key };
  return { state, reload };
}
