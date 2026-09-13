import { expect, test } from "vitest";
import {
  maskEnvVarEntries,
  removeEnvVarEntry,
  sandboxEligibleEnvVars,
  toggleEnvVarSandboxExclude,
  upsertEnvVarEntry,
} from "../convex/_envVars/documentStore";
import { MASKED_ENV_VAR_VALUE } from "../convex/_envVars/listDisplay";
import { extractPrNumber } from "../convex/_github/prUrl";
import { selectPrLifecycleTransition } from "../convex/_github/prLifecycleActions";
import {
  buildDockerInfoWaitLoop,
  buildSeedRunDockerStartCommand,
} from "../convex/_sandbox_runtime/dockerBootstrap";

test("upsertEnvVarEntry replaces the same key", () => {
  const vars = upsertEnvVarEntry(
    [{ key: "A", value: "1", sandboxExclude: false }],
    { key: "A", value: "2", sandboxExclude: true },
  );
  expect(vars).toEqual([{ key: "A", value: "2", sandboxExclude: true }]);
});

test("remove and toggle keep other keys", () => {
  const vars = [
    { key: "A", value: "1", sandboxExclude: false },
    { key: "B", value: "2", sandboxExclude: false },
  ];
  expect(removeEnvVarEntry(vars, "A")).toEqual([
    { key: "B", value: "2", sandboxExclude: false },
  ]);
  expect(toggleEnvVarSandboxExclude(vars, "B", true)).toEqual([
    { key: "A", value: "1", sandboxExclude: false },
    { key: "B", value: "2", sandboxExclude: true },
  ]);
});

test("mask and sandbox filters", () => {
  const vars = [
    { key: "A", value: "secret", sandboxExclude: true },
    { key: "B", value: "kept" },
  ];
  expect(maskEnvVarEntries(vars)).toEqual([
    { key: "A", value: MASKED_ENV_VAR_VALUE, sandboxExclude: true },
    { key: "B", value: MASKED_ENV_VAR_VALUE, sandboxExclude: false },
  ]);
  expect(sandboxEligibleEnvVars(vars)).toEqual([{ key: "B", value: "kept" }]);
});

test("extractPrNumber reads /pull/N", () => {
  expect(extractPrNumber("https://github.com/acme/app/pull/42")).toBe(42);
  expect(extractPrNumber("https://github.com/acme/app")).toBeNull();
});

test("selectPrLifecycleTransition prefers close then reopen then ready then draft", () => {
  expect(
    selectPrLifecycleTransition({
      enteringCancelled: true,
      leavingCancelled: true,
      enteringCodeReview: true,
      leavingCodeReview: true,
      asReadyOnReopen: false,
    }),
  ).toEqual({ kind: "close" });
  expect(
    selectPrLifecycleTransition({
      enteringCancelled: false,
      leavingCancelled: true,
      enteringCodeReview: false,
      leavingCodeReview: false,
      asReadyOnReopen: true,
    }),
  ).toEqual({ kind: "reopen", asReady: true });
  expect(
    selectPrLifecycleTransition({
      enteringCancelled: false,
      leavingCancelled: false,
      enteringCodeReview: true,
      leavingCodeReview: false,
      asReadyOnReopen: false,
    }),
  ).toEqual({ kind: "ready" });
  expect(
    selectPrLifecycleTransition({
      enteringCancelled: false,
      leavingCancelled: false,
      enteringCodeReview: false,
      leavingCodeReview: true,
      asReadyOnReopen: false,
    }),
  ).toEqual({ kind: "draft" });
  expect(
    selectPrLifecycleTransition({
      enteringCancelled: false,
      leavingCancelled: false,
      enteringCodeReview: false,
      leavingCodeReview: false,
      asReadyOnReopen: false,
    }),
  ).toBeNull();
});

test("docker wait loop and seed-run start share the same info poll", () => {
  const wait = buildDockerInfoWaitLoop(60);
  expect(wait).toContain("seq 1 60");
  expect(wait).toContain("docker info");
  const seed = buildSeedRunDockerStartCommand();
  expect(seed).toContain(wait);
  expect(seed).toContain("SEEDRUN-FAILED:docker-start");
});
