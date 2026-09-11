import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relative: string): string {
  return readFileSync(join(backendDir, relative), "utf8");
}

test("installation-token refresh lives only in githubToken.ts", () => {
  const service = read("callback-src/providers/githubToken.ts");
  expect(service).toContain("export async function fetchInstallationToken(");
  expect(service).toContain("github:getInstallationTokenAction");
  expect(service).toContain("export async function ensureGithubToken(");
  expect(service).toContain(
    "export async function refreshDaemonGithubTokenFromEnv(",
  );
  expect(read("callback-src/index.ts")).toContain("ensureGithubToken(");
  for (const path of [
    "callback-src/providers/claudeSdkDaemon.ts",
    "callback-src/providers/cursorSdkDaemon.ts",
    "callback-src/providers/codexAppServerDaemon.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} should call the shared helper`).toContain(
      "refreshDaemonGithubTokenFromEnv(",
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

test("PR number parsing lives only in prUrl.ts", () => {
  const service = read("convex/_github/prUrl.ts");
  expect(service).toContain("export function extractPrNumber(");
  for (const path of [
    "convex/_projects/prSync.ts",
    "convex/_agentTasks/mutations.ts",
    "convex/_sessions/prArchive.ts",
    "convex/taskWorkflowActions.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} should import the shared parser`).toMatch(
      /extractPrNumber(FromUrl)?/,
    );
    expect(source, `${path} re-inlined the PR URL regex`).not.toContain(
      "prUrl.match(/\\/pull\\/(\\d+)/)",
    );
  }
});

test("PR lifecycle scheduling is shared", () => {
  const service = read("convex/_github/prLifecycleActions.ts");
  expect(service).toContain("export async function schedulePrLifecycleActions(");
  expect(service).toContain("export function selectPrLifecycleTransition(");
  for (const path of [
    "convex/_projects/prSync.ts",
    "convex/_agentTasks/mutations.ts",
    "convex/_sessions/prArchive.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} should call the shared scheduler`).toContain(
      "schedulePrLifecycleActions(",
    );
    expect(
      source,
      `${path} re-inlined taskWorkflowActions.closePullRequest`,
    ).not.toContain("internal.taskWorkflowActions.closePullRequest");
  }
});

test("PR draft-state GraphQL lives only in pullRequestDraftState.ts", () => {
  const service = read("convex/_github/pullRequestDraftState.ts");
  expect(service).toContain("export async function convertPullRequestToDraft(");
  expect(service).toContain(
    "export async function markPullRequestReadyForReview(",
  );
  const actions = read("convex/taskWorkflowActions.ts");
  expect(actions).toContain("convertPullRequestToDraft(");
  expect(actions).toContain("markPullRequestReadyForReview(");
  expect(actions).toContain("syncPullRequestDraftState(");
  expect(actions).not.toContain("convertPullRequestToDraft(input:");
  expect(actions).not.toContain("markPullRequestReadyForReview(input:");
});

test("PR create/wait helpers live in pullRequestWrite.ts", () => {
  const service = read("convex/_github/pullRequestWrite.ts");
  expect(service).toContain("export async function createPullRequestWithGitHub(");
  expect(service).toContain("export async function waitForPullRequestHead(");
  const actions = read("convex/taskWorkflowActions.ts");
  expect(actions).toContain("createPullRequestWithGitHub(");
  expect(actions).toContain("refreshPullRequestBodyWithGitHub(");
  expect(actions).not.toContain("async function waitForPullRequestHead(");
});

test("repo and team env-var documents share documentStore", () => {
  const store = read("convex/_envVars/documentStore.ts");
  expect(store).toContain("export function upsertEnvVarEntry(");
  expect(store).toContain("export function sandboxEligibleEnvVars(");
  for (const path of [
    "convex/repoEnvVars.ts",
    "convex/teamEnvVars.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} should use upsertEnvVarEntry`).toContain(
      "upsertEnvVarEntry(",
    );
    expect(source, `${path} re-inlined the filter/push upsert`).not.toContain(
      "vars.filter((entry) => entry.key !== args.key)",
    );
  }
});

test("encrypted credential reveal/map is shared", () => {
  const service = read("convex/_envVars/encryptedEntries.ts");
  expect(service).toContain("export function decryptStoredEntry(");
  expect(service).toContain("export function decryptCredentialMap(");
  expect(read("convex/repoEnvVarsActions.ts")).toContain("decryptStoredEntry(");
  expect(read("convex/teamEnvVarsActions.ts")).toContain("decryptStoredEntry(");
  expect(read("convex/userProviderAccountsActions.ts")).toContain(
    "decryptStoredEntry(",
  );
  expect(read("convex/envVarResolver.ts")).toContain("decryptCredentialMap(");
  expect(read("convex/envVarResolver.ts")).not.toContain("decryptValue(");
});

test("storage URL+metadata resolution is shared", () => {
  const helper = read("convex/_chat/storageUrls.ts");
  expect(helper).toContain("export async function resolveStorageEntries<");
  for (const path of [
    "convex/messages.ts",
    "convex/_agentTasks/queries.ts",
    "convex/promptStash.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} should call resolveStorageEntries`).toContain(
      "resolveStorageEntries(",
    );
    expect(source, `${path} re-inlined getUrl+getMetadata`).not.toContain(
      "const [url, meta] = await Promise.all",
    );
  }
});

test("dockerd bootstrap commands are shared", () => {
  const service = read("convex/_sandbox_runtime/dockerBootstrap.ts");
  expect(service).toContain("export function buildDockerInfoWaitLoop(");
  expect(service).toContain("export function buildSeedRunDockerStartCommand(");
  const helpers = read("convex/_sandbox_runtime/helpers.ts");
  const snapshot = read("convex/snapshotActions.ts");
  expect(helpers).toContain("buildDockerInfoWaitLoop(");
  expect(helpers).toContain("buildDockerdStaleRuntimeCleanup(");
  expect(snapshot).toContain("buildSeedRunDockerStartCommand(");
  expect(helpers).not.toContain(
    "sudo rm -f /var/run/docker.pid /var/run/docker.sock",
  );
  expect(snapshot).not.toContain(
    "sudo setsid dockerd </dev/null >/tmp/dockerd.log",
  );
});

test("callback daemons share sleep/pidAlive/stale-bundle checks", () => {
  const service = read("callback-src/runtime/daemonProcess.ts");
  expect(service).toContain("export function sleep(");
  expect(service).toContain("export function pidAlive(");
  expect(service).toContain("export function callbackBundleWentStale(");
  for (const path of [
    "callback-src/providers/claudeSdkDaemon.ts",
    "callback-src/providers/cursorSdkDaemon.ts",
    "callback-src/providers/codexAppServerDaemon.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} should import daemonProcess`).toContain(
      "daemonProcess.js",
    );
    expect(source, `${path} re-inlined pidAlive`).not.toContain(
      "function pidAlive(",
    );
    expect(source, `${path} re-inlined sleep`).not.toContain("function sleep(");
    expect(source, `${path} re-inlined the fingerprint read`).not.toContain(
      "/tmp/eva-callback-fp",
    );
  }
});

test("callback daemons share pidfile claim, marker cleanup, and mutation args", () => {
  const service = read("callback-src/runtime/daemonProcess.ts");
  expect(service).toContain("export function claimDaemonPidfileBoot(");
  expect(service).toContain("export function cleanOwnedDaemonMarkers(");
  expect(service).toContain("export function buildEntityMutationArgs(");
  expect(service).toContain("export function readPidFromFile(");
  for (const path of [
    "callback-src/providers/claudeSdkDaemon.ts",
    "callback-src/providers/cursorSdkDaemon.ts",
    "callback-src/providers/codexAppServerDaemon.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} should claim via the shared helper`).toContain(
      "claimDaemonPidfileBoot(",
    );
    expect(source, `${path} should clean markers via the shared helper`).toContain(
      "cleanOwnedDaemonMarkers(",
    );
    expect(source, `${path} re-inlined pidfile writes`).not.toContain(
      "writeFileSync(DAEMON_PID_FILE",
    );
    expect(source, `${path} re-inlined Number(readFileSync`).not.toContain(
      "Number(readFileSync(",
    );
  }
});

test("callback daemons share GitHub token refresh from env", () => {
  const service = read("callback-src/providers/githubToken.ts");
  expect(service).toContain(
    "export async function refreshDaemonGithubTokenFromEnv(",
  );
  for (const path of [
    "callback-src/providers/claudeSdkDaemon.ts",
    "callback-src/providers/cursorSdkDaemon.ts",
    "callback-src/providers/codexAppServerDaemon.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} should call the shared refresh`).toContain(
      "refreshDaemonGithubTokenFromEnv(",
    );
    expect(source, `${path} re-inlined ensureGithubToken args`).not.toContain(
      "convexUrl: CONVEX_URL",
    );
  }
});

test("daemon turn resets share resetDaemonTurnStreamingState", () => {
  const state = read("callback-src/runtime/state.ts");
  expect(state).toContain("export function resetDaemonTurnStreamingState(");
  expect(state).toContain('callbackState.rawOutput = ""');
  expect(state).toContain("callbackState.lastProcessed = 0");
  for (const path of [
    "callback-src/providers/claudeSdkDaemon.ts",
    "callback-src/providers/cursorSdkDaemon.ts",
    "callback-src/providers/codexAppServerDaemon.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} should call the shared reset`).toContain(
      "resetDaemonTurnStreamingState()",
    );
    expect(source, `${path} re-inlined the flush-cursor reset`).not.toContain(
      "S.lastProcessed = 0",
    );
  }
});

test("claim poll backoff uses selectClaimPollIntervalMs", () => {
  const service = read("callback-src/runtime/daemonProcess.ts");
  expect(service).toContain("export function selectClaimPollIntervalMs(");
  expect(read("callback-src/providers/claudeSdkDaemon.ts")).toContain(
    "selectClaimPollIntervalMs(",
  );
  expect(read("callback-src/providers/cursorSdkDaemon.ts")).toContain(
    "selectClaimPollIntervalMs(",
  );
});

test("Convex mutation readers share unwrapConvexMutationPayload", () => {
  const client = read("callback-src/http/convexClient.ts");
  expect(client).toContain("export function unwrapConvexMutationPayload(");
  expect(client).toContain("const inner = result.value");
  for (const path of [
    "callback-src/providers/claimPendingTurnParse.ts",
    "callback-src/providers/claimedTurnLifecycle.ts",
    "callback-src/runtime/pendingQuestion.ts",
    "callback-src/providers/claudeSdkDaemon.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} should unwrap via the shared helper`).toContain(
      "unwrapConvexMutationPayload(",
    );
    expect(source, `${path} re-inlined the value envelope`).not.toContain(
      "const inner = result.value",
    );
  }
});

test("parsed stream lines share emitParsedStreamLine", () => {
  const router = read("callback-src/parse/streamRouter.ts");
  expect(router).toContain("export function emitParsedStreamLine(");
  expect(router).toContain("appendToRawLogFile(line)");
  expect(router).toContain("appendToRawOutput(line)");
  expect(router).toContain("processRealtimeStdoutChunk(line)");
  for (const path of [
    "callback-src/providers/claudeSdk.ts",
    "callback-src/providers/codexSdk.ts",
    "callback-src/providers/cursorSdk.ts",
    "callback-src/providers/opencodeSdk.ts",
    "callback-src/providers/claudeSdkDaemon.ts",
    "callback-src/providers/codexAppServerDaemon.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} should emit via the shared helper`).toContain(
      "emitParsedStreamLine(",
    );
    expect(source, `${path} re-inlined the stream emit`).not.toContain(
      "appendToRawOutput(line)",
    );
  }
});

test("Codex JSON objects share asJsonObject", () => {
  const utils = read("callback-src/utils.ts");
  expect(utils).toContain("export function asJsonObject(");
  expect(read("callback-src/providers/codexAppServerDaemon.ts")).toContain(
    "asJsonObject(",
  );
  expect(read("callback-src/providers/codexAppServerClient.ts")).toContain(
    "asJsonObject(",
  );
  expect(read("callback-src/providers/codexAppServerDaemon.ts")).not.toContain(
    "function objectValue(",
  );
  expect(read("callback-src/providers/codexAppServerClient.ts")).not.toContain(
    "function objectValue(",
  );
});

test("OOM score writes share writeOomScoreAdj", () => {
  const service = read("callback-src/runtime/daemonProcess.ts");
  expect(service).toContain("export function writeOomScoreAdj(");
  expect(read("callback-src/index.ts")).toContain('writeOomScoreAdj("self"');
  expect(read("callback-src/providers/opencodeServer.ts")).toContain(
    "writeOomScoreAdj(",
  );
  expect(read("callback-src/providers/cursorSdkDaemon.ts")).toContain(
    "writeOomScoreAdj(",
  );
  expect(read("callback-src/providers/opencodeServer.ts")).not.toContain(
    "function processAlive(",
  );
});

test("provider attempt outcomes share resolveProviderAttemptOutcome", () => {
  const service = read("callback-src/runtime/completion.ts");
  expect(service).toContain("export function resolveProviderAttemptOutcome(");
  expect(service).toContain("export function providerAttemptWasInterrupted(");
  expect(read("callback-src/index.ts")).toContain(
    "resolveProviderAttemptOutcome(",
  );
  expect(read("callback-src/providers/cursorSdkDaemon.ts")).toContain(
    "resolveProviderAttemptOutcome(",
  );
  expect(read("callback-src/index.ts")).not.toContain(
    "finalCode === 137 || finalCode === 143",
  );
});

test("claimed-turn failures share postClaimedTurnFailureCompletion", () => {
  const service = read("callback-src/runtime/completion.ts");
  expect(service).toContain(
    "export async function postClaimedTurnFailureCompletion(",
  );
  expect(read("callback-src/providers/claudeSdkDaemon.ts")).toContain(
    "postClaimedTurnFailureCompletion(",
  );
  expect(read("callback-src/providers/cursorSdkDaemon.ts")).toContain(
    "postClaimedTurnFailureCompletion(",
  );
});

test("Cursor refresh uses decideCallbackRefresh", () => {
  expect(read("callback-src/providers/callbackRefresh.ts")).toContain(
    "export function decideCallbackRefresh(",
  );
  expect(read("callback-src/providers/cursorSdkDaemon.ts")).toContain(
    "decideCallbackRefresh(",
  );
});

test("turn finalize shares drain and persist helpers", () => {
  const service = read("callback-src/runtime/completion.ts");
  expect(service).toContain("export async function drainStreamingAndCompleteSteps(");
  expect(service).toContain("export async function reconcileStreamingAndPersist(");
  expect(service).toContain("await flushStreaming()");
  expect(service).toContain("step.status = \"complete\"");
  expect(service).toContain("if (await setFinalizingState()) return true");
  expect(service).toContain("persistTurnWork()");
  for (const path of [
    "callback-src/providers/claudeSdkDaemon.ts",
    "callback-src/providers/cursorSdkDaemon.ts",
    "callback-src/providers/codexAppServerDaemon.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} should drain via the shared helper`).toContain(
      "drainStreamingAndCompleteSteps()",
    );
    expect(source, `${path} should persist via the shared helper`).toContain(
      "reconcileStreamingAndPersist()",
    );
  }
});

test("SDK attempt failures share recordSdkAttemptFailure", () => {
  const buffers = read("callback-src/runtime/buffers.ts");
  expect(buffers).toContain("export function recordSdkAttemptFailure(");
  expect(buffers).toContain("export function recordSdkRetry(");
  for (const path of [
    "callback-src/providers/claudeSdk.ts",
    "callback-src/providers/codexSdk.ts",
    "callback-src/providers/cursorSdk.ts",
    "callback-src/providers/opencodeSdk.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} should record failures via the helper`).toContain(
      "recordSdkAttemptFailure(",
    );
    expect(source, `${path} re-inlined the sdk-error log`).not.toContain(
      '"[sdk-error]"',
    );
  }
});

test("turn completions share buildTurnCompletionPayload", () => {
  const service = read("callback-src/runtime/completion.ts");
  expect(service).toContain("export function buildTurnCompletionPayload(");
  expect(service).toContain("pendingQuestion: S.pendingQuestionData");
  for (const path of [
    "callback-src/providers/claudeSdkDaemon.ts",
    "callback-src/providers/cursorSdkDaemon.ts",
    "callback-src/index.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} should build via the shared helper`).toContain(
      "buildTurnCompletionPayload(",
    );
  }
});

test("SDK attempts share buildStandardSdkAttemptResult", () => {
  const helper = read("callback-src/providers/attemptResult.ts");
  expect(helper).toContain("export function buildStandardSdkAttemptResult(");
  expect(helper).toContain("timedOutForZombie: false");
  for (const path of [
    "callback-src/providers/claudeSdk.ts",
    "callback-src/providers/codexSdk.ts",
    "callback-src/providers/cursorSdk.ts",
    "callback-src/providers/opencodeSdk.ts",
  ] as const) {
    const source = read(path);
    expect(source, `${path} should return via the shared helper`).toContain(
      "buildStandardSdkAttemptResult(",
    );
    expect(source, `${path} re-inlined the attempt tail`).not.toContain(
      "timedOutForZombie: false",
    );
  }
});

test("deployment status reads share fetchLatestDeploymentStatus", () => {
  const service = read("convex/_github/deploymentSnapshot.ts");
  expect(service).toContain("export async function fetchLatestDeploymentStatus(");
  expect(service).toContain("fetchLatestDeploymentStatus(");
  const overview = read("convex/_github/prOverview.ts");
  expect(overview).toContain("fetchLatestDeploymentStatus(");
  expect(overview).not.toContain("listDeploymentStatuses(");
});
