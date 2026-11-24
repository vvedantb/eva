import { describe, expect, it } from "bun:test";
import {
  CONVEX_LOCAL_BACKEND_HEALTH_URL,
  EXPECTED_LATEST_CONVEX_LOCAL_BACKEND_VERSION,
  PINNED_CONVEX_LOCAL_BACKEND_VERSION,
  buildConvexBackgroundScriptBody,
  buildConvexPostSeedPushLines,
  isConvexBackendCommand,
} from "../convex/_sandbox_runtime/convexLocalBackend";

describe("buildConvexBackgroundScriptBody", () => {
  it("plants pin under expected latest label and keeps command flag-free", () => {
    const command =
      "cd apps/eprocurement && CONVEX_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS=240 npx convex dev";
    const body = buildConvexBackgroundScriptBody(command);
    expect(body).toContain("unset CONVEX_AGENT_MODE");
    expect(body).toContain(`PIN = "${PINNED_CONVEX_LOCAL_BACKEND_VERSION}"`);
    expect(body).toContain(
      `EXPECTED_LATEST = "${EXPECTED_LATEST_CONVEX_LOCAL_BACKEND_VERSION}"`,
    );
    expect(body).toContain("curl");
    expect(body).toContain("version.convex.dev/v1/local_backend_version");
    expect(body).toContain(
      "https://api.github.com/repos/{repo}/releases/tags/{tag}",
    );
    expect(body).toContain("Accept: application/octet-stream");
    expect(body).toContain(
      "failed to plant glibc-compatible Convex backend",
    );
    expect(body).toContain(command);
    expect(body).not.toContain("--local-backend-version");
    expect(isConvexBackendCommand(command)).toBe(true);
  });

  it("only downloads when no valid planted binary exists", () => {
    const body = buildConvexBackgroundScriptBody("npx convex dev");
    const lines = body.split("\n");
    // The download must be gated behind the planted-marker checks: a resume on
    // a long-lived sandbox cannot afford a 58MB zip + ~250MB extract per boot.
    const neededAt = lines.findIndex((l) =>
      l.includes("needed = [d for d in dests if not planted(d)]"),
    );
    const reuseAt = lines.findIndex((l) => l.includes("reuse = next("));
    const downloadAt = lines.findIndex((l) =>
      l.includes("download_release_asset('get-convex/convex-backend'"),
    );
    expect(neededAt, "the marker precheck moved").toBeGreaterThan(-1);
    expect(reuseAt).toBeGreaterThan(neededAt);
    expect(downloadAt).toBeGreaterThan(reuseAt);
    expect(body).toContain("skipping download");
    expect(body).toContain("reusing planted binary");
  });

  it("plants only into real convex caches, never the cursor home", () => {
    const body = buildConvexBackgroundScriptBody("npx convex dev");
    // Cursor runs the CLI in-process under the sandbox home now, so
    // /tmp/cursor-home is not a convex cache — planting there leaked ~250MB
    // per label onto a 32GB disk (fix c06518ab).
    expect(body).not.toContain("/tmp/cursor-home");
    expect(body).toContain("os.path.expanduser('~/.cache/convex/binaries')");
    expect(body).toContain("'/home/vercel-sandbox/.cache/convex/binaries'");
  });

  it("sweeps stale Convex CLI bundle staging dirs, age-gated", () => {
    const body = buildConvexBackgroundScriptBody("npx convex dev");
    expect(body).toContain(
      "find /tmp -maxdepth 1 -type d -name '.tmp*' -mmin +60 -exec rm -rf {} +",
    );
  });

  it("wraps the command in the self-heal supervisor", () => {
    const command =
      "cd apps/eprocurement && CONVEX_LOCAL_BACKEND_STARTUP_TIMEOUT_SECS=240 npx convex dev";
    const body = buildConvexBackgroundScriptBody(command);
    // Command travels via heredoc into its own process group, verbatim.
    expect(body).toContain("<<'EVA_CONVEX_BG_CMD'");
    expect(body).toContain(`setsid bash -l "/tmp/eva-convex-bg-cmd-$$.sh"`);
    // Health probe against the local backend, wedge-restart with a cap.
    expect(body).toContain(CONVEX_LOCAL_BACKEND_HEALTH_URL);
    expect(body).toContain("Unable to pull deployment config");
    expect(body).toContain("pkill -KILL -f '[c]onvex-local-backend'");
    expect(body).toContain(
      "convex dev exited before backend healthy — restarting",
    );
  });
});

/**
 * This push is the only thing that puts a repo's functions on the snapshot's
 * local backend. Every way it can fail has to end the seed run, because the
 * alternative is worse than a red build: a green one whose snapshot boots a
 * backend with no functions on it, which every sandbox restored from that
 * snapshot then inherits (fix 2abf5bc5).
 */
describe("buildConvexPostSeedPushLines", () => {
  const script = () => buildConvexPostSeedPushLines("/tmp/repo").join("\n");

  it("fails the seed when the daemon left no local deployment config", () => {
    const lines = buildConvexPostSeedPushLines("/tmp/repo");
    const guardAt = lines.indexOf('if [ -z "$eva_cfg" ]; then');
    const elseAt = lines.indexOf("else");
    expect(guardAt, "the missing-config guard moved").toBeGreaterThan(-1);
    expect(elseAt).toBeGreaterThan(guardAt);
    const guardBody = lines.slice(guardAt, elseAt);
    expect(guardBody).toContain('  echo "SEEDRUN-FAILED:convex-push"');
    expect(guardBody).toContain("  exit 1");
  });

  it("never treats a missing config as nothing to do", () => {
    // The warn-and-continue wording this replaced is the regression itself.
    expect(script()).not.toContain("nothing to push");
  });

  it("fails the seed when every push attempt fails", () => {
    expect(script()).toContain(
      '[ "$eva_pushed" = 1 ] || { echo "SEEDRUN-FAILED:convex-push"; exit 1; }',
    );
  });

  it("marks its stage and keeps the admin key out of the trace", () => {
    const body = script();
    expect(body).toContain('echo "SEEDRUN-STAGE:convex-push"');
    const traceOffAt = body.indexOf("{ set +x; } 2>/dev/null");
    const keyReadAt = body.indexOf("eva_key=$(");
    expect(traceOffAt, "the trace guard moved").toBeGreaterThan(-1);
    expect(keyReadAt, "the admin key read moved").toBeGreaterThan(traceOffAt);
    expect(body.indexOf("unset eva_key")).toBeGreaterThan(keyReadAt);
  });
});
