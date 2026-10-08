import { test, expect } from "vitest";
import {
  pickSandboxRepoId,
  pickSnapshotCredentialRepoId,
} from "../convex/_githubRepos/sandboxRepoPick";

type Repo = {
  _id: string;
  rootDirectory?: string;
  hidden?: boolean;
  connectedBy?: string;
};

function hasProject(
  idsWithProject: ReadonlySet<string>,
): (repoId: string) => Promise<boolean> {
  return async (repoId) => idsWithProject.has(repoId);
}

test("pickSandboxRepoId uses preferred web app when root lacks VERCEL_PROJECT_ID", async () => {
  // Carepulse-shaped monorepo: shared automation on root, credentials on apps/web.
  const root: Repo = { _id: "root" };
  const web: Repo = { _id: "web", rootDirectory: "apps/web" };
  const eproc: Repo = { _id: "eproc", rootDirectory: "apps/eprocurement" };

  const picked = await pickSandboxRepoId(
    root._id,
    [root, web, eproc],
    hasProject(new Set(["web", "eproc"])),
  );

  expect(picked).toBe("web");
});

test("pickSandboxRepoId keeps an app repo that already has VERCEL_PROJECT_ID", async () => {
  const web: Repo = { _id: "web", rootDirectory: "apps/web" };
  const eproc: Repo = { _id: "eproc", rootDirectory: "apps/eprocurement" };

  const picked = await pickSandboxRepoId(
    eproc._id,
    [web, eproc],
    hasProject(new Set(["web", "eproc"])),
  );

  expect(picked).toBe("eproc");
});

test("pickSandboxRepoId falls back to any sibling app with VERCEL_PROJECT_ID", async () => {
  const root: Repo = { _id: "root" };
  // Preferred web has no project id; eprocurement does.
  const web: Repo = { _id: "web", rootDirectory: "apps/web" };
  const eproc: Repo = { _id: "eproc", rootDirectory: "apps/eprocurement" };

  const picked = await pickSandboxRepoId(
    root._id,
    [root, web, eproc],
    hasProject(new Set(["eproc"])),
  );

  expect(picked).toBe("eproc");
});

test("pickSandboxRepoId falls back to workflow repo when no sibling has the key", async () => {
  const root: Repo = { _id: "root" };
  const web: Repo = { _id: "web", rootDirectory: "apps/web" };

  const picked = await pickSandboxRepoId(
    root._id,
    [root, web],
    hasProject(new Set()),
  );

  // Preferred app (web) when nothing has VERCEL_PROJECT_ID — caller then fails
  // with the clear "must be set on this app repo" error at credential resolve.
  expect(picked).toBe("web");
});

test("pickSnapshotCredentialRepoId uses preferred web when root lacks VERCEL_PROJECT_ID", async () => {
  const root: Repo = { _id: "root" };
  const web: Repo = { _id: "web", rootDirectory: "apps/web" };
  const eproc: Repo = { _id: "eproc", rootDirectory: "apps/eprocurement" };

  const picked = await pickSnapshotCredentialRepoId(
    root._id,
    [root, web, eproc],
    hasProject(new Set(["web", "eproc"])),
  );

  expect(picked).toBe("web");
});

test("pickSnapshotCredentialRepoId does not borrow a sibling app's VERCEL_PROJECT_ID", async () => {
  const web: Repo = { _id: "web", rootDirectory: "apps/web" };
  const eproc: Repo = { _id: "eproc", rootDirectory: "apps/eprocurement" };

  const picked = await pickSnapshotCredentialRepoId(
    eproc._id,
    [web, eproc],
    hasProject(new Set(["web"])),
  );

  expect(picked).toBe("eproc");
});
