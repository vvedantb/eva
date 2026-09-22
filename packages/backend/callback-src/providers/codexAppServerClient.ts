import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync } from "fs";
import { createInterface } from "readline";
import { CODEX_BIN_PATH, CODEX_RUNTIME_HOME_DIR, WORK_DIR } from "../config.js";
import type { JsonObject, JsonValue } from "../types.js";
import { asJsonObject, log, tryParseJson } from "../utils.js";

export type AppServerNotification = {
  method: string;
  params: JsonObject;
};

type PendingRequest = {
  resolve: (value: JsonValue) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

function responseErrorMessage(message: JsonObject): string {
  const error = asJsonObject(message.error);
  return typeof error.message === "string"
    ? error.message
    : "Codex App Server request failed";
}

export class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private notifications: AppServerNotification[] = [];
  private terminalError: Error | null = null;

  start(): void {
    const command = existsSync(CODEX_BIN_PATH) ? CODEX_BIN_PATH : "codex";
    this.child = spawn(command, ["app-server"], {
      cwd: WORK_DIR,
      env: { ...process.env, CODEX_HOME: CODEX_RUNTIME_HOME_DIR },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = createInterface({ input: this.child.stdout });
    stdout.on("line", (line: string) => this.handleLine(line));
    this.child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text) log("codex app-server stderr: " + text);
    });
    this.child.on("error", (error: Error) => this.fail(error));
    this.child.on("exit", (code, signal) => {
      this.fail(
        new Error(
          "Codex App Server exited (code=" +
            String(code) +
            ", signal=" +
            String(signal ?? "none") +
            ")",
        ),
      );
    });
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: { name: "eva", title: "Eva", version: "1.0.0" },
    });
    this.notify("initialized", {});
  }

  request(method: string, params: JsonObject): Promise<JsonValue> {
    if (this.terminalError) return Promise.reject(this.terminalError);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Codex App Server request timed out: " + method));
      }, 90_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.write({ id, method, params });
    });
  }

  notify(method: string, params: JsonObject): void {
    this.write({ method, params });
  }

  drainNotifications(): AppServerNotification[] {
    const drained = this.notifications;
    this.notifications = [];
    return drained;
  }

  hasNotifications(): boolean {
    return this.notifications.length > 0;
  }

  getError(): Error | null {
    return this.terminalError;
  }

  stop(): void {
    this.child?.kill("SIGTERM");
  }

  private write(message: JsonObject): void {
    if (!this.child || !this.child.stdin.writable) {
      throw this.terminalError ?? new Error("Codex App Server is not running");
    }
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }

  private handleLine(line: string): void {
    const parsed = tryParseJson(line);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    const message: JsonObject = parsed;
    if (typeof message.id === "number" && typeof message.method !== "string") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error !== undefined) {
        pending.reject(new Error(responseErrorMessage(message)));
      } else {
        pending.resolve(message.result ?? null);
      }
      return;
    }
    if (typeof message.method !== "string") return;
    if (typeof message.id === "number") {
      this.write({
        id: message.id,
        error: {
          code: -32601,
          message: "Eva does not handle App Server requests: " + message.method,
        },
      });
      return;
    }
    this.notifications.push({
      method: message.method,
      params: asJsonObject(message.params),
    });
  }

  private fail(error: Error): void {
    if (this.terminalError) return;
    this.terminalError = error;
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
  }
}
