import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  BOAT_PTY_BRIDGE_SCRIPT,
  BOAT_PTY_BRIDGE_VERSION,
} from "../convex/_pty/boatBridge";

/**
 * Runs the real in-VM terminal bridge locally and drives it the way the web
 * TerminalPanel does with Vercel's controller-hosted PTY: a `start` frame,
 * then binary keystrokes and a `resize`, expecting `control` / `exit` frames.
 */

const PORT = 17000 + Math.floor(Math.random() * 500);
let bridge: ChildProcess;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "eva-pty-"));
  const script = join(dir, "bridge.py");
  writeFileSync(script, BOAT_PTY_BRIDGE_SCRIPT);
  bridge = spawn("python3", [script, String(PORT)], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if ((await res.text()) === BOAT_PTY_BRIDGE_VERSION) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("bridge did not start");
});

afterAll(() => {
  bridge.kill();
});

function session(script: string, afterConnect: (ws: WebSocket) => void) {
  return new Promise<{ texts: string[]; output: string }>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/`);
    ws.binaryType = "arraybuffer";
    const texts: string[] = [];
    let output = "";
    const timer = setTimeout(
      () => reject(new Error(`timeout: ${output}`)),
      5000,
    );
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: "start",
          command: "bash",
          args: ["-c", script],
          env: ["TERM=xterm-256color"],
          cwd: "/tmp",
          cols: 120,
          rows: 40,
        }),
      );
    ws.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (typeof event.data === "string") {
        texts.push(event.data);
        if (event.data.includes('"connected"')) afterConnect(ws);
        return;
      }
      output += new TextDecoder().decode(event.data);
    };
    ws.onclose = () => {
      clearTimeout(timer);
      resolve({ texts, output });
    };
  });
}

describe("boat PTY bridge", () => {
  test("health probe answers with the version", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/`);
    expect(await res.text()).toBe(BOAT_PTY_BRIDGE_VERSION);
  });

  test("start → connected, keystrokes reach the shell, exit code comes back", async () => {
    const { texts, output } = await session(
      "stty size; read line; echo got:$line; exit 7",
      (ws) => ws.send(new TextEncoder().encode("hello\r")),
    );
    expect(texts[0]).toContain('"status": "connected"');
    expect(output).toContain("40 120");
    expect(output).toContain("got:hello");
    expect(texts.at(-1)).toContain('"code": 7');
  });

  test("resize frames change the PTY size", async () => {
    const { output } = await session("read go; stty size", (ws) => {
      ws.send(JSON.stringify({ type: "resize", cols: 90, rows: 20 }));
      setTimeout(() => ws.send(new TextEncoder().encode("\r")), 100);
    });
    expect(output).toContain("20 90");
  });
});
