import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));
const defaultsSource = readSource(
  "../convex/_userProviderAccounts/defaults.ts",
);
const projectChatSource = readSource("../convex/projectChatWorkflow.ts");
const taskChatSource = readSource("../convex/agentTaskChatWorkflow.ts");
const sessionExecutionSource = readSource("../convex/_sessions/execution.ts");
const executionSource = readSource("../convex/_sandbox_runtime/execution.ts");
const envResolverSource = readSource("../convex/envVarResolver.ts");
const handoffHookSource = readSource(
  "../../../apps/web/src/lib/hooks/useProviderAccountHandoff.ts",
);
const projectPanelSource = readSource(
  "../../../apps/web/src/lib/components/projects/ProjectSandboxChatPanel.tsx",
);
const taskPanelSource = readSource(
  "../../../apps/web/src/lib/components/tasks/TaskSandboxChatPanel.tsx",
);
const sessionPanelSource = readSource(
  "../../../apps/web/src/routes/_repo/$owner/$repo/sessions/ChatPanel.tsx",
);
const sessionModelSource = readSource(
  "../../../apps/web/src/lib/hooks/useSessionModel.ts",
);
const chatBodyUtilsSource = readSource(
  "../../../apps/web/src/lib/components/chat/chatBodyUtils.ts",
);

describe("provider account handoff is one shared contract", () => {
  test("turn account resolution lives in one helper used by all three chats", () => {
    const helper = functionBody(defaultsSource, "resolveTurnProviderAccountId");
    expect(helper).toContain('changePolicy: "owner-only"');
    expect(helper).toContain('changePolicy: "owner-pool"');
    expect(projectChatSource).toContain("resolveTurnProviderAccountId(");
    expect(taskChatSource).toContain("resolveTurnProviderAccountId(");
    expect(sessionExecutionSource).toContain("resolveTurnProviderAccountId(");
    expect(projectChatSource).not.toContain(
      "function resolveProjectTurnProviderAccountId",
    );
    expect(taskChatSource).not.toContain(
      "function resolveTaskTurnProviderAccountId",
    );
    expect(sessionExecutionSource).not.toContain(
      "function resolveSessionTurnProviderAccountId",
    );
  });

  test("composer wait lives in one hook used by all three chats", () => {
    expect(handoffHookSource).toContain("await args.persist(");
    expect(handoffHookSource).toContain("await args.prewarm()");
    expect(projectPanelSource).toContain("useProviderAccountHandoff(");
    expect(taskPanelSource).toContain("useProviderAccountHandoff(");
    expect(sessionModelSource).toContain("useProviderAccountHandoff(");
    // The composer gate itself is shared too, so the account swap blocks
    // input the same way on all three — see the queueing contract below.
    for (const panel of [
      projectPanelSource,
      taskPanelSource,
      sessionPanelSource,
    ]) {
      expect(panel).toContain("sandboxComposerState({");
      expect(panel).toContain("isInputDisabled={composer.isInputDisabled}");
    }
    const gate = functionBody(chatBodyUtilsSource, "sandboxComposerState");
    expect(gate).toContain("isInputDisabled: isAsleep || isSwitchingAccount");
  });

  test("daemon identity includes both account id and credential revision", () => {
    const signature = functionBody(executionSource, "buildDaemonOptsSig");
    expect(signature).toContain("providerAccountId: string | undefined");
    expect(signature).toContain(
      "providerAccountCredentialRevision: number | undefined",
    );
    expect(signature).toContain('${providerAccountId ?? ""}');
    expect(signature).toContain('${providerAccountCredentialRevision ?? ""}');
  });

  test("an invalid explicit account cannot fall back to Team", () => {
    const resolver = functionBody(
      envResolverSource,
      "resolveProviderAccountCredentials",
    );
    expect(resolver).toContain(
      'throw new Error("Selected provider account is no longer available")',
    );
    expect(resolver).toContain(
      'throw new Error("Selected provider account does not support this model")',
    );
    expect(resolver).not.toContain("falling back to team credential");
  });
});

describe("project chat provider account handoff", () => {
  test("the requested account is validated and becomes the staged turn account", () => {
    const startExecute = exportBody(projectChatSource, "startExecute");
    expect(startExecute).toContain("resolveTurnProviderAccountId(");
    expect(startExecute).toContain('changePolicy: "owner-only"');
    expect(startExecute).toContain("providerAccountId,");
    expect(startExecute).not.toContain("void args.providerAccountId");
    expect(startExecute).not.toContain(
      "providerAccountId: project.providerAccountId",
    );
  });

  test("queued turns and credential badges use the validated account", () => {
    const addMessage = exportBody(projectChatSource, "addMessage");
    const enqueueMessage = exportBody(projectChatSource, "enqueueMessage");
    expect(addMessage).toContain("resolveTurnProviderAccountId(");
    expect(enqueueMessage).toContain("resolveTurnProviderAccountId(");
  });
});

describe("task chat provider account handoff", () => {
  test("the requested account is validated and becomes the staged turn account", () => {
    const startExecute = exportBody(taskChatSource, "startExecute");
    expect(startExecute).toContain("resolveTurnProviderAccountId(");
    expect(startExecute).toContain('changePolicy: "owner-only"');
    expect(startExecute).toContain("providerAccountId,");
    expect(startExecute).not.toContain("void args.providerAccountId");
    expect(startExecute).not.toContain(
      "providerAccountId: task.providerAccountId",
    );
  });

  test("queued turns and credential badges use the validated account", () => {
    const addMessage = exportBody(taskChatSource, "addMessage");
    const enqueueMessage = exportBody(taskChatSource, "enqueueMessage");
    expect(addMessage).toContain("resolveTurnProviderAccountId(");
    expect(enqueueMessage).toContain("resolveTurnProviderAccountId(");
  });
});

describe("session chat provider account handoff", () => {
  test("the requested account is validated and becomes the staged turn account", () => {
    // Sessions stage through one shared helper, so the resolution lives there;
    // startExecute only has to hand the composer's pick to it unchanged.
    const startExecute = exportBody(sessionExecutionSource, "startExecute");
    expect(startExecute).toContain("stageAndStartSessionTurn(ctx, {");
    expect(startExecute).toContain("providerAccountId: args.providerAccountId");
    const stager = functionBody(
      sessionExecutionSource,
      "stageAndStartSessionTurn",
    );
    expect(stager).toContain("resolveTurnProviderAccountId(");
    expect(stager).toContain('changePolicy: "owner-pool"');
    expect(stager).toContain("providerAccountId: stickyProviderAccountId");
    expect(stager).not.toContain(
      "providerAccountId: session.providerAccountId",
    );
  });

  test("queued turns persist the validated account onto the session", () => {
    const enqueueMessage = exportBody(sessionExecutionSource, "enqueueMessage");
    expect(enqueueMessage).toContain("resolveTurnProviderAccountId(");
    expect(enqueueMessage).toContain("providerAccountId,");
  });
});

function readSource(relativePath: string): string {
  return readFileSync(join(testsDir, relativePath), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
}

function exportBody(source: string, exportName: string): string {
  const declaration = `export const ${exportName} =`;
  const startAt = source.indexOf(declaration);
  expect(startAt, `${exportName} moved or was renamed`).toBeGreaterThan(-1);
  const rest = source.slice(startAt + declaration.length);
  const nextAt = rest.search(/\nexport const /);
  return declaration + (nextAt < 0 ? rest : rest.slice(0, nextAt));
}

function functionBody(source: string, functionName: string): string {
  const declaration = `function ${functionName}(`;
  const startAt = source.indexOf(declaration);
  expect(startAt, `${functionName} moved or was renamed`).toBeGreaterThan(-1);
  const rest = source.slice(startAt + declaration.length);
  const nextAt = rest.search(/\n(?:export |async function |function |const )/);
  return declaration + (nextAt < 0 ? rest : rest.slice(0, nextAt));
}
