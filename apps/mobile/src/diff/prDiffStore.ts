import { api, type Id } from "@eva/backend";
import { applyIgnoreWhitespace, buildDiffFileEntries, type DiffFileEntry, type ReviewComment } from "@eva/shared";
import { useAction } from "convex/react";
import { useEffect } from "react";
import { z } from "zod";
import { jsonParser, keyedStore, persistedStore } from "@/storage/persistedStore";

/** One pull request, as every Code read and setting below is keyed. */
export type PrRef = { repoId: Id<"githubRepos">; prNumber: number };

/** The changes between two commits, as a chat turn's checkpoints (`beforeSha...afterSha`). */
export type CompareRef = {
  repoId: Id<"githubRepos">;
  base: string;
  head: string;
  /** `https://github.com/<owner>/<name>`, for the per-file "View file" link (the compare read names none). */
  repoUrl: string;
};

/** What a diff screen shows: a pull request, or two commits. Its reads and settings are keyed by it. */
export type DiffRef = PrRef | CompareRef;

const prKey = (ref: DiffRef) => ("prNumber" in ref ? `${ref.repoId}.${ref.prNumber}` : `${ref.repoId}.${ref.base}...${ref.head}`);

type PrDiffPayload = { entries: DiffFileEntry[]; truncated: boolean; repoUrl: string; headSha: string };

export type PrDiffState =
  | { status: "loading" }
  | { status: "error" }
  | ({ status: "ready"; refreshing: boolean } & PrDiffPayload);

type DiffEntry = { state: PrDiffState; loadedAt: number };

const diffs = keyedStore<DiffEntry | null>(null);

const DIFF_FRESH_MS = 2 * 60_000;

/**
 * A pull request's diff (`github.getPrDiff`, what is pushed to GitHub), split
 * into files with the Hide whitespace setting applied, as the web
 * `usePrDiff`. It is an action, not a subscription, so it is read when a
 * screen opens on a diff older than `DIFF_FRESH_MS`, and every screen on the
 * same pull request shares the result. `reload` reads past the server cache
 * (the web "Refresh diff") and keeps the diff on screen meanwhile.
 */
export function usePrDiff(pr: DiffRef | null): { state: PrDiffState; reload: () => void } {
  const getPrDiff = useAction(api.github.getPrDiff);
  const getCompareDiff = useAction(api.github.getCompareDiff);
  const key = pr === null ? null : prKey(pr);
  const entry = diffs.useValue(key ?? "");
  const ignoreWhitespace = useIgnoreWhitespace()[0];

  const load = (force: boolean) => {
    if (pr === null || key === null) return;
    const previous = diffs.get(key)?.state;
    const shown = previous?.status === "ready" ? previous : null;
    diffs.set(key, { state: shown === null ? { status: "loading" } : { ...shown, refreshing: true }, loadedAt: Date.now() });
    const read =
      "prNumber" in pr
        ? getPrDiff({ ...pr, force })
        : getCompareDiff({ repoId: pr.repoId, baseSha: pr.base, headSha: pr.head, force }).then((compare) => {
            if (compare.unavailable) throw new Error("Commit not on GitHub yet");
            return { ...compare, repoUrl: pr.repoUrl, headSha: pr.head };
          });
    read.then(
      (payload) =>
        diffs.set(key, {
          state: {
            status: "ready",
            refreshing: false,
            entries: buildDiffFileEntries(payload.diff),
            truncated: payload.truncated,
            repoUrl: payload.repoUrl,
            headSha: payload.headSha,
          },
          loadedAt: Date.now(),
        }),
      () => diffs.set(key, { state: shown === null ? { status: "error" } : { ...shown, refreshing: false }, loadedAt: Date.now() }),
    );
  };

  const loadIfStale = () => {
    const current = key === null ? null : diffs.get(key);
    const fresh = current !== null && (current.state.status === "loading" || Date.now() - current.loadedAt <= DIFF_FRESH_MS);
    if (!fresh) load(false);
  };

  useEffect(() => {
    loadIfStale();
    // oxlint-disable-next-line react/exhaustive-deps
  }, [key]);

  const state = entry?.state ?? { status: "loading" };
  return {
    state:
      state.status === "ready" && ignoreWhitespace ? { ...state, entries: applyIgnoreWhitespace(state.entries) } : state,
    reload: () => load(true),
  };
}

const ignoreWhitespaceStore = persistedStore("prDiffIgnoreWs", false, (raw) => (raw === "true" ? true : raw === "false" ? false : null));

/**
 * The web "Hide whitespace changes" (`useDiffIgnoreWhitespace`): one setting
 * for every diff, on this device. It is refused while line comments are
 * pending, as the web does: the patch it rewrites is the one they were drawn on.
 */
export function useIgnoreWhitespace(): [boolean, (next: boolean) => void] {
  return [ignoreWhitespaceStore.useValue("all"), (next) => ignoreWhitespaceStore.set("all", next)];
}

const viewedPaths = z.array(z.string());

const viewedStore = persistedStore<readonly string[]>("prDiffViewed", [], jsonParser(viewedPaths));

/**
 * The web Viewed ticks (`useDiffViewedFiles`): the paths marked Viewed on one
 * pull request. The web keeps them in the browser, not the backend, so the
 * phone keeps its own on the device; the chat diff and the Code tab share them.
 */
export function useViewedFiles(pr: DiffRef): {
  isViewed: (path: string) => boolean;
  setViewed: (path: string, viewed: boolean) => void;
  count: number;
} {
  const key = prKey(pr);
  const paths = viewedStore.useValue(key);
  return {
    isViewed: (path) => paths.includes(path),
    setViewed: (path, viewed) => {
      const current = viewedStore.get(key);
      const next = viewed ? (current.includes(path) ? current : [...current, path]) : current.filter((entry) => entry !== path);
      viewedStore.set(key, next);
    },
    count: paths.length,
  };
}

/**
 * A line comment drafted on Code, waiting to be posted with a review: GitHub's
 * anchor (`lineRangeCommentTarget`), so a range carries its first line too.
 */
export type PendingLineComment = {
  id: string;
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  startLine: number | null;
  startSide: "LEFT" | "RIGHT" | null;
  label: string;
  body: string;
  startIndex: number;
  endIndex: number;
  diff: string;
};

/** A pending comment as a chat prompt's `<review_comment>` block takes it (`appendReviewCommentsToPrompt`). */
export function toReviewComment(comment: PendingLineComment): ReviewComment {
  return {
    id: comment.id,
    filePath: comment.path,
    startIndex: comment.startIndex,
    endIndex: comment.endIndex,
    rangeLabel: comment.label,
    text: comment.body,
    diff: comment.diff,
    anchor: { line: comment.line, side: comment.side, startLine: comment.startLine, startSide: comment.startSide },
  };
}

const pendingComments = keyedStore<readonly PendingLineComment[]>([]);
let nextCommentId = 0;

/**
 * The web `PendingReviewCommentsProvider` for one pull request: line comments
 * drafted on Code or the chat's diff, posted with the next review
 * (`github.submitPrReview`) or sent with the chat's next prompt, and cleared
 * then. In memory only, as on the web, but shared by the file screens and
 * both composers, as the web sandbox shares them between its Review tab and
 * its chat, so they last until the app closes.
 */
export function usePendingLineComments(pr: DiffRef | null): {
  comments: readonly PendingLineComment[];
  add: (comment: Omit<PendingLineComment, "id">) => void;
  remove: (id: string) => void;
  clear: () => void;
} {
  const key = pr === null ? "" : prKey(pr);
  const comments = pendingComments.useValue(key);
  return {
    comments,
    add: (comment) => {
      nextCommentId += 1;
      pendingComments.set(key, [...pendingComments.get(key), { ...comment, id: String(nextCommentId) }]);
    },
    remove: (id) =>
      pendingComments.set(
        key,
        pendingComments.get(key).filter((comment) => comment.id !== id),
      ),
    clear: () => pendingComments.set(key, []),
  };
}
