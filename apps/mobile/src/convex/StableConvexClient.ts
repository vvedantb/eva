import { ConvexReactClient, type Watch, type WatchQueryOptions } from "convex/react";
import { type ArgsAndOptions, type FunctionReference, type FunctionReturnType, getFunctionName } from "convex/server";
import { convexToJson, type Value } from "convex/values";

/** The last result a query handed out, the raw one it came from, and its JSON. */
type Held = { raw: Value; held: Value; json: string };

/**
 * A `ConvexReactClient` whose queries keep their result object while its data
 * stays the same. Convex hands out a new object for every server result, and
 * after a reconnect (the phone back from the background) the server sends
 * every live query again, unchanged. A new object fails every memo the React
 * Compiler built, so each mounted list redrew all its rows. Here a result with
 * the same JSON as the last one is the last one, so nothing downstream redraws.
 */
export class StableConvexClient extends ConvexReactClient {
  /** Keyed by the query's name and args; dropped when its last subscriber goes. */
  private readonly results = new Map<string, Held>();
  private readonly subscribers = new Map<string, number>();

  override watchQuery<Query extends FunctionReference<"query">>(
    query: Query,
    ...argsAndOptions: ArgsAndOptions<Query, WatchQueryOptions>
  ): Watch<FunctionReturnType<Query>> {
    const watch = super.watchQuery(query, ...argsAndOptions);
    const key = `${getFunctionName(query)}:${JSON.stringify(convexToJson(argsAndOptions[0] ?? {}))}`;
    return {
      ...watch,
      onUpdate: (callback) => {
        this.subscribers.set(key, (this.subscribers.get(key) ?? 0) + 1);
        const unsubscribe = watch.onUpdate(callback);
        return () => {
          unsubscribe();
          const left = (this.subscribers.get(key) ?? 1) - 1;
          if (left > 0) {
            this.subscribers.set(key, left);
          } else {
            this.subscribers.delete(key);
            this.results.delete(key);
          }
        };
      },
      localQueryResult: () => this.hold(key, watch.localQueryResult()),
    };
  }

  /** `next`, or the equal result handed out before it. */
  private hold(key: string, next: Value | undefined): Value | undefined {
    // Loading, or between a reconnect and the server's answer: keep what was held for the answer.
    if (next === undefined) return undefined;
    const last = this.results.get(key);
    if (last?.raw === next) return last.held;
    const json = JSON.stringify(convexToJson(next));
    if (last?.json === json) {
      last.raw = next;
      return last.held;
    }
    this.results.set(key, { raw: next, held: next, json });
    return next;
  }
}
