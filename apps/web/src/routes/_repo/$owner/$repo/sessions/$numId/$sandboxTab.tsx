import { createFileRoute, redirect } from "@tanstack/react-router";

import {
  isDiffView,
  isLegacyDesktopSandboxTab,
  isLegacyDiffsSandboxTab,
  isLegacyPrSandboxTab,
  isReviewTab,
  splitCorruptedSandboxTabParam,
} from "@/lib/search-params";

function redirectToReviewDiffs(args: {
  owner: string;
  repo: string;
  numId: string;
  diffView?: string;
  search: Record<string, unknown>;
  diffFile?: string;
}) {
  const diffView =
    args.diffView !== undefined && isDiffView(args.diffView)
      ? args.diffView
      : "diffView" in args.search &&
          typeof args.search.diffView === "string" &&
          isDiffView(args.search.diffView)
        ? args.search.diffView
        : "unified";

  throw redirect({
    to: "/$owner/$repo/sessions/$numId/review/diffs/$diffView",
    params: {
      owner: args.owner,
      repo: args.repo,
      numId: args.numId,
      diffView,
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
  "/_repo/$owner/$repo/sessions/$numId/$sandboxTab",
)({
  beforeLoad: ({ params, search }) => {
    const corrupted = splitCorruptedSandboxTabParam(params.sandboxTab);
    if (corrupted) {
      if (
        isLegacyDiffsSandboxTab(corrupted.tab) ||
        isLegacyPrSandboxTab(corrupted.tab) ||
        corrupted.tab === "review"
      ) {
        redirectToReviewDiffs({
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
        : corrupted.tab === "terminal"
          ? "preview"
          : corrupted.tab;
      throw redirect({
        to: "/$owner/$repo/sessions/$numId/$sandboxTab",
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
        to: "/$owner/$repo/sessions/$numId/$sandboxTab",
        params: {
          owner: params.owner,
          repo: params.repo,
          numId: params.numId,
          sandboxTab: "computer",
        },
        replace: true,
      });
    }
    if (params.sandboxTab === "terminal") {
      throw redirect({
        to: "/$owner/$repo/sessions/$numId/$sandboxTab",
        params: {
          owner: params.owner,
          repo: params.repo,
          numId: params.numId,
          sandboxTab: "preview",
        },
        replace: true,
      });
    }
    if (isLegacyDiffsSandboxTab(params.sandboxTab)) {
      redirectToReviewDiffs({
        owner: params.owner,
        repo: params.repo,
        numId: params.numId,
        search,
      });
    }
    if (
      isLegacyPrSandboxTab(params.sandboxTab) ||
      params.sandboxTab === "review"
    ) {
      const fromSearch =
        "prTab" in search &&
        typeof search.prTab === "string" &&
        isReviewTab(search.prTab)
          ? search.prTab
          : "diffs";
      if (fromSearch === "overview") {
        throw redirect({
          to: "/$owner/$repo/sessions/$numId/review/overview",
          params: {
            owner: params.owner,
            repo: params.repo,
            numId: params.numId,
          },
          search: { ...search, prTab: undefined, diffView: undefined },
          replace: true,
        });
      }
      if (fromSearch === "recap") {
        throw redirect({
          to: "/$owner/$repo/sessions/$numId/review/recap",
          params: {
            owner: params.owner,
            repo: params.repo,
            numId: params.numId,
          },
          search: { ...search, prTab: undefined, diffView: undefined },
          replace: true,
        });
      }
      redirectToReviewDiffs({
        owner: params.owner,
        repo: params.repo,
        numId: params.numId,
        search,
      });
    }
  },
  // Shell is rendered by the `$numId` layout so Preview/Console stay mounted.
  component: () => null,
});
