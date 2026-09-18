"use node";
/**
 * Code-mode sandbox: runs model-written JavaScript in QuickJS (WASM) and
 * bridges `tools.<name>(args)` calls back to async host handlers.
 *
 * Uses the sync QuickJS build with deferred promises rather than the asyncify
 * build: an asyncified host call made from a pending microtask job crashes the
 * WASM module, whereas a deferred promise lets the host settle the call later
 * while the driver pumps pending jobs until the script's own promise settles.
 * Every QuickJS handle is disposed on the path that created it: deferreds in
 * the final block, settled promise states right after they are read, strings
 * and errors through `consume`. Host handlers that settle after disposal are
 * ignored via the `alive` flag, because touching a disposed context aborts the
 * whole process.
 */
import {
  newQuickJSWASMModuleFromVariant,
  shouldInterruptAfterDeadline,
  type QuickJSDeferredPromise,
  type QuickJSWASMModule,
} from "quickjs-emscripten-core";
import variant from "@jitl/quickjs-singlefile-cjs-release-sync";
import { z } from "zod";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

export interface SandboxTool {
  readonly name: string;
  /** true for tools that change state; counted against `maxMutatingCalls`. */
  readonly mutating: boolean;
  /**
   * Receives the JSON text of the single argument object and resolves to the
   * JSON text of the result. A rejection's message is what the script sees.
   */
  readonly invoke: (argsJson: string) => Promise<string>;
}

export interface ExecuteLimits {
  /** Wall clock for the whole execution, including time spent in tools. */
  readonly deadlineMs: number;
  /** QuickJS heap cap. */
  readonly memoryBytes: number;
  /** Total tool calls per execution. */
  readonly maxCalls: number;
  /** Subset cap for tools that change state. */
  readonly maxMutatingCalls: number;
}

export const DEFAULT_EXECUTE_LIMITS: ExecuteLimits = {
  deadlineMs: 60_000,
  memoryBytes: 64 * 1024 * 1024,
  maxCalls: 50,
  maxMutatingCalls: 10,
};

export interface ToolCallRecord {
  readonly name: string;
  readonly ms: number;
  readonly ok: boolean;
}

interface ExecuteTelemetry {
  readonly logs: readonly string[];
  readonly calls: readonly ToolCallRecord[];
  readonly ms: number;
}

export type ExecuteOutcome =
  | ({ readonly ok: true; readonly result: JsonValue } & ExecuteTelemetry)
  | ({ readonly ok: false; readonly error: string } & ExecuteTelemetry);

const MAX_LOG_LINES = 200;
const MAX_LOG_LINE_CHARS = 2_000;
const MAX_STACK_BYTES = 1024 * 1024;

const sandboxOutputSchema = z.object({
  result: jsonValueSchema,
  logs: z.array(z.string()),
});

const thrownValueSchema = z.object({
  name: z.string().optional(),
  message: z.string().optional(),
});

let modulePromise: Promise<QuickJSWASMModule> | undefined;

/** Loads the WASM module once per process; a failed load is retried next call. */
function loadModule(): Promise<QuickJSWASMModule> {
  if (modulePromise === undefined) {
    modulePromise = newQuickJSWASMModuleFromVariant(variant).catch((err) => {
      modulePromise = undefined;
      throw err;
    });
  }
  return modulePromise;
}

/**
 * Globals the script sees. `tools` is a lazy proxy so any name routes to the
 * host without the catalog living inside the VM; `search` is an ordinary tool
 * the host supplies. `console` collects lines instead of printing.
 */
const PRELUDE = `
const __logs = [];
const __format = (value) => {
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
};
const __log = (...args) => {
  __logs.push(args.map(__format).join(" "));
};
const console = { log: __log, info: __log, warn: __log, error: __log, debug: __log };
const __enumerationError = () =>
  new Error('tools cannot be enumerated. Call tools.search({ query: "..." }) to find tools; an empty query lists them all.');
const tools = new Proxy({}, {
  get(_target, prop) {
    if (prop === "then" || typeof prop === "symbol") return undefined;
    const name = String(prop);
    return (args) =>
      __invokeTool(name, JSON.stringify(args === undefined ? {} : args)).then((raw) => JSON.parse(raw));
  },
  has() { return true; },
  ownKeys() { throw __enumerationError(); },
  getOwnPropertyDescriptor() { throw __enumerationError(); },
});
`;

function wrapScript(code: string): string {
  return `${PRELUDE}
(async () => {
${code}
})().then((value) => {
  try {
    return JSON.stringify({ result: value === undefined ? null : value, logs: __logs });
  } catch (err) {
    throw new Error("Return value is not JSON-serialisable: " + (err && err.message ? err.message : String(err)));
  }
});`;
}

/** Turns a value dumped out of the VM (usually a thrown Error) into one line. */
function describeThrown(dumped: JsonValue): string {
  const parsed = thrownValueSchema.safeParse(dumped);
  if (parsed.success && parsed.data.message !== undefined) {
    return parsed.data.name
      ? `${parsed.data.name}: ${parsed.data.message}`
      : parsed.data.message;
  }
  return typeof dumped === "string" ? dumped : JSON.stringify(dumped);
}

function describeRejection(reason: Error | JsonValue): string {
  if (reason instanceof Error) return reason.message;
  return typeof reason === "string" ? reason : JSON.stringify(reason);
}

function truncateLogs(logs: readonly string[]): string[] {
  const lines = logs
    .slice(0, MAX_LOG_LINES)
    .map((line) =>
      line.length > MAX_LOG_LINE_CHARS
        ? `${line.slice(0, MAX_LOG_LINE_CHARS)}… [truncated]`
        : line,
    );
  if (logs.length > MAX_LOG_LINES) {
    lines.push(`… [${logs.length - MAX_LOG_LINES} more log lines truncated]`);
  }
  return lines;
}

/**
 * Runs `code` (the body of an async function) against `tools` inside a fresh
 * QuickJS runtime. Never throws: every failure, including a broken WASM load,
 * is reported as an `ok: false` outcome.
 */
export async function executeCode(
  code: string,
  tools: readonly SandboxTool[],
  limitOverrides: Partial<ExecuteLimits> = {},
): Promise<ExecuteOutcome> {
  const limits: ExecuteLimits = {
    ...DEFAULT_EXECUTE_LIMITS,
    ...limitOverrides,
  };
  const startedAt = Date.now();
  const deadline = startedAt + limits.deadlineMs;
  const calls: ToolCallRecord[] = [];
  const fail = (
    error: string,
    logs: readonly string[] = [],
  ): ExecuteOutcome => ({
    ok: false,
    error,
    logs: truncateLogs(logs),
    calls,
    ms: Date.now() - startedAt,
  });

  let quickJs: QuickJSWASMModule;
  try {
    quickJs = await loadModule();
  } catch (err) {
    return fail(
      `Sandbox unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const runtime = quickJs.newRuntime();
  runtime.setMemoryLimit(limits.memoryBytes);
  runtime.setMaxStackSize(MAX_STACK_BYTES);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(deadline));
  const vm = runtime.newContext();

  const deferreds: QuickJSDeferredPromise[] = [];
  const pending = new Set<QuickJSDeferredPromise>();
  let totalCalls = 0;
  let mutatingCalls = 0;
  // Host handlers can settle after this function has returned (a deadline hit
  // while a slow tool is still running). Touching the vm then aborts the process.
  let alive = true;

  vm.newFunction("__invokeTool", (nameHandle, argsHandle) => {
    const name = vm.getString(nameHandle);
    const argsJson = argsHandle === undefined ? "{}" : vm.getString(argsHandle);
    const deferred = vm.newPromise();
    deferreds.push(deferred);
    pending.add(deferred);
    void deferred.settled.then(() => pending.delete(deferred));
    const rejectWith = (message: string) => {
      vm.newError(message).consume((error) => deferred.reject(error));
    };

    const tool = byName.get(name);
    if (tool === undefined) {
      rejectWith(`Unknown tool: ${name}`);
      return deferred.handle;
    }
    if (totalCalls >= limits.maxCalls) {
      rejectWith(`Tool call limit (${limits.maxCalls}) reached`);
      return deferred.handle;
    }
    if (tool.mutating && mutatingCalls >= limits.maxMutatingCalls) {
      rejectWith(
        `Mutating tool call limit (${limits.maxMutatingCalls}) reached`,
      );
      return deferred.handle;
    }
    totalCalls += 1;
    if (tool.mutating) mutatingCalls += 1;

    const callStartedAt = Date.now();
    tool.invoke(argsJson).then(
      (resultJson) => {
        if (!alive) return;
        calls.push({ name, ms: Date.now() - callStartedAt, ok: true });
        vm.newString(resultJson).consume((value) => deferred.resolve(value));
      },
      (reason) => {
        if (!alive) return;
        calls.push({ name, ms: Date.now() - callStartedAt, ok: false });
        rejectWith(describeRejection(reason));
      },
    );
    return deferred.handle;
  }).consume((fn) => vm.setProp(vm.global, "__invokeTool", fn));

  try {
    const evaluated = vm.evalCode(wrapScript(code), "execute.js");
    if (evaluated.error) {
      const message = describeThrown(vm.dump(evaluated.error));
      evaluated.error.dispose();
      return fail(message);
    }
    const promise = evaluated.value;
    try {
      // Drive the VM: run microtasks, then either finish, wait for the next
      // host tool to settle, or give up at the deadline. Jobs are pumped before
      // the deadline check so an interrupt or OOM thrown inside the script
      // surfaces as its own message rather than the generic deadline one.
      for (;;) {
        const jobs = runtime.executePendingJobs();
        if (jobs.error) {
          const message = describeThrown(vm.dump(jobs.error));
          jobs.error.dispose();
          return fail(message);
        }
        const state = vm.getPromiseState(promise);
        if (state.type === "fulfilled") {
          const json = vm.getString(state.value);
          state.value.dispose();
          const parsed = sandboxOutputSchema.safeParse(JSON.parse(json));
          if (!parsed.success) return fail("Sandbox returned malformed output");
          return {
            ok: true,
            result: parsed.data.result,
            logs: truncateLogs(parsed.data.logs),
            calls,
            ms: Date.now() - startedAt,
          };
        }
        if (state.type === "rejected") {
          const message = describeThrown(vm.dump(state.error));
          state.error.dispose();
          return fail(message);
        }
        // Pending: `state.error` is a plain host Error here, not a handle.
        if (Date.now() > deadline) {
          return fail(`Execution exceeded ${limits.deadlineMs}ms`);
        }
        if (jobs.value > 0) continue;
        if (pending.size === 0) {
          return fail("Execution stalled: the script's promise never settles");
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const deadlineTimer = new Promise<void>((resolve) => {
          timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
        });
        try {
          await Promise.race([
            ...[...pending].map((deferred) => deferred.settled),
            deadlineTimer,
          ]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      }
    } finally {
      promise.dispose();
    }
  } catch (err) {
    return fail(
      `Sandbox failure: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    alive = false;
    for (const deferred of deferreds) if (deferred.alive) deferred.dispose();
    vm.dispose();
    runtime.dispose();
  }
}
