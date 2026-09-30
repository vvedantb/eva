import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createBoatClient } from "../convex/_sandbox/boatProvider";
import type { SandboxClient, SandboxHandle } from "../convex/_sandbox/provider";
import { ensurePreviewNavigationProxy } from "../convex/_sandbox_runtime/previewProxy";
import {
  getPreviewGrantPublicJwk,
  signPreviewGrant,
} from "../convex/previewGrant";
import { PREVIEW_GRANT_PARAM } from "../convex/previewGrantConfig";
import { connectBoatTerminal } from "../convex/_pty/boat";
import { ensureSharedTerminal } from "../convex/_pty/tmux";
import { EVA_ENV_FILE } from "../convex/_sandbox/vercelEnvFile";

/**
 * Opt-in end-to-end run against a real Boat account: the provider, the preview
 * auth proxy, the terminal bridge, the desktop stack and template snapshots,
 * each through the same code Eva runs. Skipped unless BOAT_E2E_API_KEY is set
 * (it bills a few cents and takes a few minutes):
 *
 *   BOAT_E2E_API_KEY=boat_… PREVIEW_GRANT_PRIVATE_KEY="$(npx convex env get PREVIEW_GRANT_PRIVATE_KEY)" \
 *     SANDBOX_BOAT_TYPE=default npx vitest run tests/boatProvider.e2e.test.ts
 *
 * SANDBOX_BOAT_TYPE=default is for trial accounts, which cannot start `large`.
 */

const apiKey = process.env.BOAT_E2E_API_KEY;
const TIMEOUT = 300_000;

describe.skipIf(!apiKey)("boat provider end to end", () => {
  let client: SandboxClient;
  let handle: SandboxHandle;
  const cleanup: string[] = [];

  beforeAll(async () => {
    // The terminal refuses to open without it (the proxy gate needs it).
    process.env.WEB_APP_URL ??= "https://eva.example";
    client = createBoatClient({ apiKey: apiKey ?? "" });
    handle = await client.create({
      envVars: {},
      lifecycle: { autoStopMinutes: 60, labels: { "eva.purpose": "e2e" } },
    });
    cleanup.push(handle.id);
  }, TIMEOUT);

  afterAll(async () => {
    for (const id of cleanup) {
      await client.deleteSnapshot(id).catch(() => undefined);
    }
  }, TIMEOUT);

  test("bootstrap laid down the Vercel-era paths", async () => {
    const r = await handle.exec(
      "test -L /vercel/sandbox && test -w /tmp/repo && test -d /home/eva && echo $TMPDIR",
    );
    expect(r).toEqual({ exitCode: 0, output: "/home/user/tmp\n" });
  });

  test("env file, cwd, env and sudo reach the command", async () => {
    await handle.writeFile(EVA_ENV_FILE, "export EVA_E2E='from-env-file'\n");
    const r = await handle.exec('echo "$EVA_E2E $EXTRA $(pwd) $(id -u)"', {
      cwd: "/tmp/repo",
      env: { EXTRA: "it's quoted" },
      sudo: true,
    });
    expect(r.output.trim()).toBe("from-env-file it's quoted /tmp/repo 0");
  });

  test(
    "commands over the 600s sync cap run detached and still return output",
    async () => {
      const r = await handle.exec("sleep 2; echo long; exit 4", {
        timeoutSeconds: 900,
      });
      expect(r).toEqual({ exitCode: 4, output: "long\n" });
    },
    TIMEOUT,
  );

  test(
    "git clone over the shell (public eva repo)",
    async () => {
      await handle.git.clone(
        "https://github.com/vvedantb/eva.git",
        "/tmp/repo/eva",
        "x-access-token",
        "",
      );
      const { branches } = await handle.git.branches("/tmp/repo/eva");
      expect(branches.length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  test(
    "preview: proxy + grant → cookie → app, and unauthenticated is refused",
    async () => {
      await handle.execDetached(
        "cd /tmp && echo eva-e2e-ok > index.html && exec python3 -m http.server 13000 --bind 127.0.0.1",
      );
      const proxyPort = await ensurePreviewNavigationProxy(
        handle,
        13000,
        {
          publicKeyJwk: getPreviewGrantPublicJwk(),
          sandboxId: handle.id,
          repoId: "e2e",
          webAppUrl: "https://eva.example",
          inject: false,
          authPort: 3000,
        },
        3000,
      );
      const { url } = await handle.previewUrl(proxyPort);
      expect(url).toMatch(/\.on\.boat\.dev/);

      const anonymous = await fetch(`${url}/index.html`, {
        redirect: "manual",
      });
      expect(anonymous.status).not.toBe(200);

      const grant = await signPreviewGrant({
        sandboxId: handle.id,
        port: 3000,
        sub: "e2e",
      });
      const exchanged = await fetch(
        `${url}/index.html?${PREVIEW_GRANT_PARAM}=${grant}`,
        {
          redirect: "manual",
        },
      );
      expect(exchanged.status).toBe(302);
      const cookie = exchanged.headers.get("set-cookie")?.split(";")[0] ?? "";
      const page = await fetch(`${url}/index.html`, { headers: { cookie } });
      expect(await page.text()).toContain("eva-e2e-ok");
    },
    TIMEOUT,
  );

  test(
    "terminal: shared tmux pane over the bridge, same frames as Vercel",
    async () => {
      const shared = await ensureSharedTerminal(handle, "e2e");
      const { wsUrl } = await connectBoatTerminal(handle, {
        repoId: "e2e",
        subject: "e2e",
      });
      const result = await new Promise<{ texts: string[]; output: string }>(
        (resolve, reject) => {
          const ws = new WebSocket(wsUrl);
          ws.binaryType = "arraybuffer";
          const texts: string[] = [];
          let output = "";
          const timer = setTimeout(() => reject(new Error(output)), 30_000);
          ws.onopen = () =>
            ws.send(
              JSON.stringify({
                type: "start",
                command: "bash",
                args: [
                  "-lc",
                  `echo pane=${shared.sessionName}; echo $EVA_E2E; exit 3`,
                ],
                env: ["TERM=xterm-256color"],
                cwd: "/tmp/repo",
                cols: 100,
                rows: 30,
              }),
            );
          ws.onmessage = (e: MessageEvent<string | ArrayBuffer>) => {
            if (typeof e.data === "string") texts.push(e.data);
            else output += new TextDecoder().decode(e.data);
          };
          ws.onclose = () => {
            clearTimeout(timer);
            resolve({ texts, output });
          };
          ws.onerror = () => reject(new Error(`ws error: ${output}`));
        },
      );
      expect(result.texts[0]).toContain("connected");
      expect(result.output).toContain(`pane=${shared.sessionName}`);
      expect(result.output).toContain("from-env-file");
      expect(result.texts.at(-1)).toContain('"code": 3');

      // Without a grant the upgrade is refused.
      const bare = new URL(wsUrl);
      bare.searchParams.delete(PREVIEW_GRANT_PARAM);
      const refused = await new Promise<boolean>((resolve) => {
        const ws = new WebSocket(bare.toString());
        ws.onopen = () => resolve(false);
        ws.onerror = () => resolve(true);
      });
      expect(refused).toBe(true);
    },
    TIMEOUT,
  );

  test(
    "desktop: Xvnc + websockify + noVNC come up",
    async () => {
      await handle.desktop?.start();
      const r = await handle.exec(
        "xprop -display :1 -root >/dev/null && curl -fsS http://127.0.0.1:16080/vnc_lite.html >/dev/null && echo up",
      );
      expect(r.output.trim()).toBe("up");
    },
    TIMEOUT,
  );

  test(
    "stop → template → fork carries files; resume brings the original back",
    async () => {
      await handle.exec("echo persisted > /tmp/repo/marker");
      const { snapshotId } = await handle.createSnapshot({ name: "e2e" });
      expect(snapshotId).toBe(handle.id);
      for (let i = 0; i < 90; i++) {
        const info = await client.getSnapshot(snapshotId);
        if (info?.status === "ready") break;
        await new Promise((r) => setTimeout(r, 2_000));
      }
      expect((await client.getSnapshot(snapshotId))?.status).toBe("ready");

      const fork = await client.create({
        snapshot: snapshotId,
        envVars: {},
        lifecycle: { autoStopMinutes: 60 },
      });
      cleanup.push(fork.id);
      expect((await fork.exec("cat /tmp/repo/marker")).output).toBe(
        "persisted\n",
      );
      await fork.delete();

      await handle.start(120, { resumeAfterStop: true });
      expect(handle.state).toBe("running");
      expect((await handle.exec("cat /tmp/repo/marker")).output).toBe(
        "persisted\n",
      );
      expect(await handle.classifyForReconcile()).toBe("alive");
      await handle.stop();
      expect(await handle.classifyForReconcile()).toBe("dead");
    },
    TIMEOUT * 2,
  );
});
