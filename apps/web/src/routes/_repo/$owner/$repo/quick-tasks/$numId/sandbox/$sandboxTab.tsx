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

const CLEAR_REVIEW_SEARCH = {
  draft: undefined,
  diffFile: undefined,
  diffView: undefined,
  prTab: undefined,
} as const;

function redirectToQuickTaskReview(args: {
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
  const diffFile =
    args.diffFile !== undefined
      ? args.diffFile
      : typeof args.search.diffFile === "string"
        ? args.search.diffFile
        : undefined;

  if (dest.kind === "overview") {
    throw redirect({
      to: "/$owner/$repo/quick-tasks/$numId/sandbox/review/overview",
      params: {
        owner: args.owner,
        repo: args.repo,
        numId: args.numId,
      },
      search: (prev) => ({
        ...prev,
        draft: undefined,
        diffFile,
        diffView: undefined,
        prTab: undefined,
      }),
      replace: true,
    });
  }

  if (dest.kind === "recap") {
    throw redirect({
      to: "/$owner/$repo/quick-tasks/$numId/sandbox/review/recap",
      params: {
        owner: args.owner,
        repo: args.repo,
        numId: args.numId,
      },
      search: (prev) => ({
        ...prev,
        draft: undefined,
        diffFile,
        diffView: undefined,
        prTab: undefined,
      }),
      replace: true,
    });
  }

  throw redirect({
    to: "/$owner/$repo/quick-tasks/$numId/sandbox/review/diffs/$diffView",
    params: {
      owner: args.owner,
      repo: args.repo,
      numId: args.numId,
      diffView: dest.diffView,
    },
    search: (prev) => ({
      ...prev,
      draft: undefined,
      diffFile,
      diffView: undefined,
      prTab: undefined,
    }),
    replace: true,
  });
}

export const Route = createFileRoute(
  "/_repo/$owner/$repo/quick-tasks/$numId/sandbox/$sandboxTab",
)({
  beforeLoad: ({ params, search }) => {
    const corrupted = splitCorruptedSandboxTabParam(params.sandboxTab);
    if (corrupted) {
      if (
        isLegacyDiffsSandboxTab(corrupted.tab) ||
        isLegacyPrSandboxTab(corrupted.tab) ||
        corrupted.tab === "review"
      ) {
        redirectToQuickTaskReview({
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
        to: "/$owner/$repo/quick-tasks/$numId/sandbox/$sandboxTab",
        params: {
          owner: params.owner,
          repo: params.repo,
          numId: params.numId,
          sandboxTab,
        },
        search: (prev) => ({
          ...prev,
          draft: undefined,
          diffFile: corrupted.diffFile,
          diffView: corrupted.diffView,
          prTab: undefined,
          ...(corrupted.file !== undefined ? { file: corrupted.file } : {}),
        }),
        replace: true,
      });
    }
    if (isLegacyDesktopSandboxTab(params.sandboxTab)) {
      throw redirect({
        to: "/$owner/$repo/quick-tasks/$numId/sandbox/$sandboxTab",
        params: {
          owner: params.owner,
          repo: params.repo,
          numId: params.numId,
          sandboxTab: "computer",
        },
        search: (prev) => ({ ...prev, ...CLEAR_REVIEW_SEARCH }),
        replace: true,
      });
    }
    if (
      isLegacyPrSandboxTab(params.sandboxTab) ||
      isLegacyDiffsSandboxTab(params.sandboxTab) ||
      params.sandboxTab === "review"
    ) {
      redirectToQuickTaskReview({
        owner: params.owner,
        repo: params.repo,
        numId: params.numId,
        search,
      });
    }
    if (!isTaskRouteSandboxTab(params.sandboxTab)) {
      throw redirect({
        to: "/$owner/$repo/quick-tasks/$numId/sandbox/$sandboxTab",
        params: {
          owner: params.owner,
          repo: params.repo,
          numId: params.numId,
          sandboxTab: "preview",
        },
        search: (prev) => ({ ...prev, ...CLEAR_REVIEW_SEARCH }),
      });
    }
  },
  component: () => null,
});
