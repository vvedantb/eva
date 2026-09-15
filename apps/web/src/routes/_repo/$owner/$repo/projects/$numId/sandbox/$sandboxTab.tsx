import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  isDiffView,
  isLegacyDesktopSandboxTab,
  isLegacyDiffsSandboxTab,
  isLegacyPrSandboxTab,
  isTaskRouteSandboxTab,
  reviewPathFromSearch,
  splitCorruptedSandboxTabParam,
} from "@/lib/search-params";

function redirectToProjectReview(args: {
  owner: string;
  repo: string;
  numId: string;
  search: Record<string, unknown>;
  diffView?: string;
  diffFile?: string;
}) {
  const dest = reviewPathFromSearch({
    prTab: args.search.prTab,
    diffView:
      args.diffView !== undefined && isDiffView(args.diffView)
        ? args.diffView
        : args.search.diffView,
  });

  if (dest.kind === "overview") {
    throw redirect({
      to: "/$owner/$repo/projects/$numId/sandbox/review/overview",
      params: {
        owner: args.owner,
        repo: args.repo,
        numId: args.numId,
      },
      search: {
        ...args.search,
        prTab: undefined,
        diffView: undefined,
        ...(args.diffFile !== undefined ? { diffFile: args.diffFile } : {}),
      },
      replace: true,
    });
  }

  if (dest.kind === "recap") {
    throw redirect({
      to: "/$owner/$repo/projects/$numId/sandbox/review/recap",
      params: {
        owner: args.owner,
        repo: args.repo,
        numId: args.numId,
      },
      search: {
        ...args.search,
        prTab: undefined,
        diffView: undefined,
        ...(args.diffFile !== undefined ? { diffFile: args.diffFile } : {}),
      },
      replace: true,
    });
  }

  throw redirect({
    to: "/$owner/$repo/projects/$numId/sandbox/review/diffs/$diffView",
    params: {
      owner: args.owner,
      repo: args.repo,
      numId: args.numId,
      diffView: dest.diffView,
    },
    search: {
      ...args.search,
      prTab: undefined,
      diffView: undefined,
      ...(args.diffFile !== undefined ? { diffFile: args.diffFile } : {}),
    },
    replace: true,
  });
}

export const Route = createFileRoute(
  "/_repo/$owner/$repo/projects/$numId/sandbox/$sandboxTab",
)({
  beforeLoad: ({ params, search }) => {
    const corrupted = splitCorruptedSandboxTabParam(params.sandboxTab);
    if (corrupted) {
      if (
        isLegacyDiffsSandboxTab(corrupted.tab) ||
        isLegacyPrSandboxTab(corrupted.tab) ||
        corrupted.tab === "review"
      ) {
        redirectToProjectReview({
          owner: params.owner,
          repo: params.repo,
          numId: params.numId,
          diffView: corrupted.diffView,
          diffFile: corrupted.diffFile,
          search: {},
        });
      }
      const sandboxTab = isLegacyDesktopSandboxTab(corrupted.tab)
        ? "computer"
        : isTaskRouteSandboxTab(corrupted.tab)
          ? corrupted.tab
          : "preview";
      throw redirect({
        to: "/$owner/$repo/projects/$numId/sandbox/$sandboxTab",
        params: {
          owner: params.owner,
          repo: params.repo,
          numId: params.numId,
          sandboxTab,
        },
        search: {
          diffFile: corrupted.diffFile,
          diffView: corrupted.diffView,
          ...(corrupted.file !== undefined ? { file: corrupted.file } : {}),
        },
        replace: true,
      });
    }
    if (isLegacyDesktopSandboxTab(params.sandboxTab)) {
      throw redirect({
        to: "/$owner/$repo/projects/$numId/sandbox/$sandboxTab",
        params: {
          owner: params.owner,
          repo: params.repo,
          numId: params.numId,
          sandboxTab: "computer",
        },
        replace: true,
      });
    }
    if (
      isLegacyPrSandboxTab(params.sandboxTab) ||
      isLegacyDiffsSandboxTab(params.sandboxTab) ||
      params.sandboxTab === "review"
    ) {
      redirectToProjectReview({
        owner: params.owner,
        repo: params.repo,
        numId: params.numId,
        search,
      });
    }
    if (!isTaskRouteSandboxTab(params.sandboxTab)) {
      throw redirect({
        to: "/$owner/$repo/projects/$numId/sandbox/$sandboxTab",
        params: {
          owner: params.owner,
          repo: params.repo,
          numId: params.numId,
          sandboxTab: "preview",
        },
      });
    }
  },
  // Shell is rendered by the `sandbox` layout so Preview/Console stay mounted.
  component: () => null,
});
