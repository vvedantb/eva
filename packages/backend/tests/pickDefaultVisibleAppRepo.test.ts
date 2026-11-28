import { expect, test } from "bun:test";
import { pickDefaultVisibleAppRepo } from "../convex/_githubRepos/sandboxRepoPick";

type Repo = {
  _id: string;
  rootDirectory?: string;
  hidden?: boolean;
  connectedBy?: string;
};

test("pickDefaultVisibleAppRepo prefers apps/web among visible siblings", () => {
  const root: Repo = { _id: "root" };
  const eproc: Repo = { _id: "eproc", rootDirectory: "apps/eprocurement" };
  const web: Repo = { _id: "web", rootDirectory: "apps/web" };

  expect(pickDefaultVisibleAppRepo([root, eproc, web])?._id).toBe("web");
});

test("pickDefaultVisibleAppRepo skips hidden apps", () => {
  const hiddenWeb: Repo = {
    _id: "web",
    rootDirectory: "apps/web",
    hidden: true,
  };
  const eproc: Repo = { _id: "eproc", rootDirectory: "apps/eprocurement" };

  expect(pickDefaultVisibleAppRepo([hiddenWeb, eproc])?._id).toBe("eproc");
});

test("pickDefaultVisibleAppRepo prefers connected app when no web", () => {
  const eproc: Repo = { _id: "eproc", rootDirectory: "apps/eprocurement" };
  const mobile: Repo = {
    _id: "mobile",
    rootDirectory: "apps/mobile",
    connectedBy: "user_1",
  };

  expect(pickDefaultVisibleAppRepo([eproc, mobile])?._id).toBe("mobile");
});

test("pickDefaultVisibleAppRepo returns undefined when only root remains", () => {
  const root: Repo = { _id: "root" };
  expect(pickDefaultVisibleAppRepo([root])).toBeUndefined();
});
