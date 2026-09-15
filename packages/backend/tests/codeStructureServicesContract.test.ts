import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relative: string): string {
  return readFileSync(join(backendDir, relative), "utf8");
}

const callbackSources = [
  "callback-src/index.ts",
  "callback-src/providers/claudeSdkDaemon.ts",
  "callback-src/providers/cursorSdkDaemon.ts",
  "callback-src/providers/codexAppServerDaemon.ts",
] as const;

test("installation-token refresh lives only in githubToken.ts", () => {
  const service = read("callback-src/providers/githubToken.ts");
  expect(service).toContain("export async function fetchInstallationToken(");
  expect(service).toContain("github:getInstallationTokenAction");
  for (const path of callbackSources) {
    const source = read(path);
    expect(source, `${path} should call the shared helper`).toContain(
      "ensureGithubToken(",
    );
    expect(source, `${path} re-inlined the Convex token action`).not.toContain(
      "github:getInstallationTokenAction",
    );
  }
});

test("task and session deployment polls share fetchGitHubDeploymentSnapshot", () => {
  const actions = read("convex/taskWorkflowActions.ts");
  expect(actions).toContain("fetchGitHubDeploymentSnapshot(");
  expect(actions).toContain("runDeploymentPollAttempt(");
  expect(actions.match(/octokit\.rest\.repos\.getBranch\(/g)).toBeNull();
  expect(actions.match(/listDeploymentStatuses\(/g)).toBeNull();
});

test("git network commands share gitRemoteAuthPrefix", () => {
  const git = read("convex/_sandbox_runtime/git.ts");
  expect(git).toContain("gitRemoteAuthPrefix(");
  expect(
    git.match(
      /git config --unset-all http\.https:\/\/github\.com\/\.extraheader/g,
    ),
  ).toBeNull();
});

test("HTTP readiness probes share buildHttpReadyProbeCommand", () => {
  const desktop = read("convex/_sandbox_runtime/desktop.ts");
  const services = read("convex/_sandbox_runtime/services.ts");
  expect(desktop).toContain("buildHttpReadyProbeCommand(");
  expect(services).toContain("buildHttpReadyProbeCommand(");
  expect(desktop).not.toContain("for i in $(seq 1 20); do curl");
  expect(services).not.toContain("for i in $(seq 1 20); do curl");
});

test("claim handlers share resolveStorageUrls", () => {
  const helper = read("convex/_chat/storageUrls.ts");
  expect(helper).toContain("export async function resolveStorageUrls<");
  for (const path of [
    "convex/_chat/taskChatDaemon.ts",
    "convex/_chat/projectChatDaemon.ts",
    "convex/_sessions/workflow.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} lost resolveStorageUrls`).toContain(
      "resolveStorageUrls(",
    );
    expect(source, `${path} re-inlined storage.getUrl mapping`).not.toContain(
      "attachmentStorageIds ?? []).map",
    );
  }
});

test("public Convex URL resolution is shared", () => {
  const launch = read("convex/_sandbox_runtime/launch.ts");
  const gitCredentials = read("convex/_sandbox_runtime/gitCredentials.ts");
  const mcp = read("convex/mcp/nodeActions.ts");
  expect(launch).toContain("resolvePublicConvexCloudUrl(");
  expect(launch).toContain("resolvePublicConvexSiteUrl(");
  expect(gitCredentials).toContain("resolvePublicConvexSiteUrl(");
  expect(mcp).toContain("resolvePublicConvexCloudUrl(");
  expect(launch).not.toContain("EVA_PUBLIC_CONVEX_URL ?? requireEnv");
});
