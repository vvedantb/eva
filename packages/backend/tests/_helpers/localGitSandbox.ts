import { execFileSync } from "node:child_process";
import { quote } from "shell-quote";
import type {
  SandboxExecResult,
  SandboxHandle,
} from "../../convex/_sandbox/provider";
import { workspaceDirShell } from "../../convex/_sandbox_runtime/helpers";

/** Hermetic git: no user config, no prompts, a fixed author. */
export const gitEnv = {
  ...process.env,
  HOME: undefined,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
  GIT_AUTHOR_NAME: "eva-test",
  GIT_AUTHOR_EMAIL: "eva-test@example.com",
  GIT_COMMITTER_NAME: "eva-test",
  GIT_COMMITTER_EMAIL: "eva-test@example.com",
};

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    env: gitEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * A sandbox handle that runs each shell command locally, with the sandbox
 * workspace pointed at `workspace` and (when given) the GitHub remote URL
 * pointed at a local bare repository.
 */
export function localGitSandboxHandle(opts: {
  workspace: string;
  remote?: { url: string; path: string };
}): SandboxHandle {
  const outOfScope = (member: string): never => {
    throw new Error(`fake sandbox: ${member} is out of scope for this test`);
  };
  const { remote } = opts;
  return {
    id: "sbx-local-git",
    state: "running",
    errorReason: null,
    classifyForReconcile: () => Promise.resolve("alive"),
    exec: (cmd: string): Promise<SandboxExecResult> => {
      // The commands quote the URL the way git.ts does, so match that form.
      const withWorkspace = cmd.replaceAll(
        workspaceDirShell(),
        quote([opts.workspace]),
      );
      const local = remote
        ? withWorkspace.replaceAll(quote([remote.url]), quote([remote.path]))
        : withWorkspace;
      try {
        const output = execFileSync("bash", ["-c", local], {
          env: gitEnv,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        return Promise.resolve({ exitCode: 0, output });
      } catch (error) {
        const failure =
          error instanceof Error &&
          "status" in error &&
          typeof error.status === "number" &&
          "stderr" in error &&
          typeof error.stderr === "string" &&
          "stdout" in error &&
          typeof error.stdout === "string"
            ? {
                exitCode: error.status,
                output: `${error.stdout}${error.stderr}`,
              }
            : { exitCode: 1, output: String(error) };
        return Promise.resolve(failure);
      }
    },
    refresh: () => outOfScope("refresh"),
    stop: () => outOfScope("stop"),
    start: () => outOfScope("start"),
    writeFile: () => outOfScope("writeFile"),
    execDetached: () => outOfScope("execDetached"),
    archive: () => outOfScope("archive"),
    extendTimeout: () => outOfScope("extendTimeout"),
    delete: () => outOfScope("delete"),
    previewUrl: () => outOfScope("previewUrl"),
    createSnapshot: () => outOfScope("createSnapshot"),
    git: {
      branches: () => outOfScope("git.branches"),
      clone: () => outOfScope("git.clone"),
      checkoutBranch: () => outOfScope("git.checkoutBranch"),
    },
  };
}
