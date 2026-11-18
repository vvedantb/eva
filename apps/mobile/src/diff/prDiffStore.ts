import { api, type Id } from "@eva/backend";
import { applyIgnoreWhitespace, buildDiffFileEntries, type DiffFileEntry } from "@eva/shared";
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

// ── The diff ────────────────────────────────────────────────────────────────

type PrDiffPayload = { entries: DiffFileEntry[]; truncated: boolean; repoUrl: string; headSha: string };

export type PrDiffState =
  | { status: "loading" }
  | { status: "error" }
  /** `refreshing` keeps the diff on screen while a reload runs. */
  | ({ status: "ready"; refreshing: boolean } & PrDiffPayload);

type DiffEntry = { state: PrDiffState; loadedAt: number };

const diffs = keyedStore<DiffEntry | null>(null);

/**
 * How long a read diff is reused by the next screen that opens it. The same
 * as the server's ActionCache TTL (`PR_DIFF_CACHE_TTL_MS`): a read sooner
 * returns the same payload anyway, so the file screen opens on the list's
 * diff instead of downloading it again.
 */
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
    // Two commits read `github.getCompareDiff`, which names no repo URL or head: the ref carries them,
    // for the per-file "View file" link. A commit GitHub does not have yet (a push pending) is an error.
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
      // A failed reload keeps the diff that is on screen.
      () => diffs.set(key, { state: shown === null ? { status: "error" } : { ...shown, refreshing: false }, loadedAt: Date.now() }),
    );
  };

  /** Reads the diff unless one is loading or was read in the last `DIFF_FRESH_MS`. */
  const loadIfStale = () => {
    const current = key === null ? null : diffs.get(key);
    const fresh = current !== null && (current.state.status === "loading" || Date.now() - current.loadedAt <= DIFF_FRESH_MS);
    if (!fresh) load(false);
  };

  // An effect because an action read has no query to subscribe to: one check per key.
  useEffect(() => {
    loadIfStale();
    // `key` names every input of `loadIfStale`, which is a new closure each render.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [key]);

  const state = entry?.state ?? { status: "loading" };
  return {
    state:
      state.status === "ready" && ignoreWhitespace ? { ...state, entries: applyIgnoreWhitespace(state.entries) } : state,
    reload: () => load(true),
  };
}

// ── Hide whitespace, Viewed ─────────────────────────────────────────────────

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

// ── Pending line comments ───────────────────────────────────────────────────

/**
 * A line comment drafted on Code, waiting to be posted with a review: GitHub's
 * anchor (`lineRangeCommentTarget`), so a range carries its first line too.
 */
export type PendingLineComment = {
  id: string;
  path: string;
  /** The last line of the range, which carries the comment. */
  line: number;
  side: "LEFT" | "RIGHT";
  /** The range's first line; null for a one-line comment. */
  startLine: number | null;
  startSide: "LEFT" | "RIGHT" | null;
  /** The web range label: `+12`, `-4`, `9` or `+3 to +5`. */
  label: string;
  body: string;
};

const pendingComments = keyedStore<readonly PendingLineComment[]>([]);
let nextCommentId = 0;

/**
 * The web `PendingReviewCommentsProvider` for one pull request: line comments
 * drafted on Code, posted with the next review (`github.submitPrReview`) and
 * cleared then. In memory only, as on the web, but shared by the file
 * screens and the composer, so they last until the app closes.
 */
export function usePendingLineComments(pr: DiffRef): {
  comments: readonly PendingLineComment[];
  add: (comment: Omit<PendingLineComment, "id">) => void;
  remove: (id: string) => void;
  clear: () => void;
} {
  const key = prKey(pr);
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
