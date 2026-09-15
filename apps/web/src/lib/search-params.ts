import {
  parseAsString,
  parseAsStringLiteral,
  parseAsArrayOf,
  parseAsInteger,
} from "nuqs";

const searchOptions = { history: "replace" as const };
const tabOptions = { history: "push" as const };

export const searchParser = parseAsString
  .withDefault("")
  .withOptions(searchOptions);

const taskStatuses = [
  "todo",
  "in_progress",
  "business_review",
  "code_review",
  "done",
  "cancelled",
] as const;
export const statusesParser = parseAsArrayOf(parseAsStringLiteral(taskStatuses))
  .withDefault([...taskStatuses])
  .withOptions(searchOptions);

const projectPhases = [
  "draft",
  "finalized",
  "in_progress",
  "business_review",
  "code_review",
  "completed",
  "cancelled",
] as const;
const sortDirections = ["asc", "desc"] as const;
export const sortDirParser = parseAsStringLiteral(sortDirections)
  .withDefault("desc")
  .withOptions(searchOptions);

const timeRanges = ["24h", "7d", "30d", "90d", "all"] as const;
export const timeRangeParser = parseAsStringLiteral(timeRanges)
  .withDefault("30d")
  .withOptions(searchOptions);

// Quick Tasks list filters (shareable "what you're looking at" state). View
// mode is a per-user presentation preference and stays in localStorage —
// see quick-tasks/_utils.ts.
const quickTaskSortFields = [
  "status",
  "lastRun",
  "updated",
  "created",
  "title",
  "priority",
] as const;
// No default here (unlike most parsers): the fallback depends on the active
// view, so quick-tasks/_utils.ts resolves null against a per-view default.
export const quickTaskSortFieldParser =
  parseAsStringLiteral(quickTaskSortFields).withOptions(searchOptions);

// Same reason as quickTaskSortFieldParser — the default direction pairs with
// the per-view default field, so it cannot be baked in here.
export const quickTaskSortDirParser =
  parseAsStringLiteral(sortDirections).withOptions(searchOptions);

// Quick Tasks default to "all time" (unlike the generic timeRangeParser's
// "30d" default used elsewhere) and have no hourly view, so they keep their
// own vocabulary and default.
const quickTaskTimeRanges = ["7d", "30d", "90d", "all"] as const;
export const quickTaskTimeRangeParser = parseAsStringLiteral(
  quickTaskTimeRanges,
)
  .withDefault("all")
  .withOptions(searchOptions);

export const quickTaskProjectParser = parseAsString
  .withDefault("none")
  .withOptions(searchOptions);

export const quickTaskUserParser = parseAsString
  .withDefault("all")
  .withOptions(searchOptions);

export const quickTaskAssigneeParser = parseAsString
  .withDefault("all")
  .withOptions(searchOptions);

export const quickTaskTagsParser = parseAsArrayOf(parseAsString)
  .withDefault([])
  .withOptions(searchOptions);

/**
 * The state "no filters applied" means, read off the parsers themselves.
 *
 * Both "is anything filtered?" and "clear all filters" have to agree with the
 * parser defaults, and spelling those out a second time is how `project` ended
 * up cleared to "all" while the parser defaulted to "none" — leaving ?project=all
 * in the URL and treating the default as an active filter.
 */
export const QUICK_TASK_FILTER_DEFAULTS = {
  project: quickTaskProjectParser.defaultValue,
  user: quickTaskUserParser.defaultValue,
  assignee: quickTaskAssigneeParser.defaultValue,
  tags: quickTaskTagsParser.defaultValue,
  statuses: statusesParser.defaultValue,
  timeRange: quickTaskTimeRangeParser.defaultValue,
};

// Projects list filters (shareable "what you're looking at" state). View,
// timelineRange, and timelineZoom are per-user presentation preferences and
// stay in localStorage — see projects/_utils.ts.
// hiddenPhases stores exclusions (blocklist), so the default is empty —
// reuses the same phase set as `projectPhases` above.
export const hiddenProjectPhasesParser = parseAsArrayOf(
  parseAsStringLiteral(projectPhases),
)
  .withDefault([])
  .withOptions(searchOptions);

const projectSortFields = ["created", "title", "priority"] as const;
export const projectSortFieldParser = parseAsStringLiteral(projectSortFields)
  .withDefault("created")
  .withOptions(searchOptions);

const sandboxTabs = [
  "preview",
  "browser",
  "editor",
  "computer",
  "review",
  "files",
  "agents",
  "prd",
  "designs",
  "artifacts",
  "documents",
] as const;
export type SandboxTab = (typeof sandboxTabs)[number];

// Full sandbox path of the file open in the session File Viewer tab, persisted
// in the URL so a viewed file survives reload and is shareable.
export const fileViewerPathParser = parseAsString
  .withDefault("")
  .withOptions(searchOptions);

// Whether a markdown file in the File Viewer shows rendered output or its
// source. In the URL alongside `?file=` so the choice survives reload.
const markdownViews = ["rendered", "source"] as const;
export const markdownViewParser = parseAsStringLiteral(markdownViews)
  .withDefault("rendered")
  .withOptions(searchOptions);

export function isSessionSandboxTab(s: string): s is SandboxTab {
  return sandboxTabs.some((tab) => tab === s);
}

/** Old Computer-tab URL segment; redirect to `computer`. */
export function isLegacyDesktopSandboxTab(s: string): boolean {
  return s === "desktop";
}

/** Old Diffs-tab URL segment; redirect to `review/diffs`. */
export function isLegacyDiffsSandboxTab(s: string): boolean {
  return s === "diffs";
}

/** Old Review-tab URL segment (`pr`); redirect to `review`. */
export function isLegacyPrSandboxTab(s: string): boolean {
  return s === "pr";
}

const taskRouteSandboxTabs = [
  "preview",
  "browser",
  "editor",
  "computer",
  "review",
  "files",
  "agents",
  "artifacts",
  "documents",
] as const;
export type TaskRouteSandboxTab = (typeof taskRouteSandboxTabs)[number];

export function isTaskRouteSandboxTab(s: string): s is TaskRouteSandboxTab {
  return taskRouteSandboxTabs.some((tab) => tab === s);
}

/**
 * The review tab set, shared by the standalone Reviews page
 * (`/reviews/$prNumber/$reviewTab`) and the sandbox Review tab
 * (`…/review/$tab`). One union so the two surfaces cannot drift apart.
 *
 * The ids are URL slugs and outlive their labels: `overview` is presented as
 * "Activity" and `diffs` as "Changes" (see `REVIEW_TAB_META`). Renaming the
 * slugs would break every link anybody has pasted into a task or a PR comment
 * for the sake of two words nothing renders, so the labels moved and the slugs
 * stayed. `canonicalReviewTab` accepts the label-shaped spellings too.
 */
const reviewTabs = ["overview", "commits", "checks", "diffs", "recap"] as const;
export type ReviewTab = (typeof reviewTabs)[number];
export const REVIEW_DEFAULT_TAB: ReviewTab = "overview";

export function isReviewTab(s: string): s is ReviewTab {
  return reviewTabs.some((tab) => tab === s);
}

/** Slugs a tab used to answer to, or is labelled as, redirected to canonical. */
export function canonicalReviewTab(s: string): ReviewTab | undefined {
  if (s === "diff" || s === "changes") return "diffs";
  if (s === "activity") return "overview";
  return isReviewTab(s) ? s : undefined;
}

// Layout for the Diffs tab — path segment (`/review/diffs/unified`).
const diffViews = ["unified", "split"] as const;
export type DiffView = (typeof diffViews)[number];
export function isDiffView(s: string): s is DiffView {
  return s === "unified" || s === "split";
}

export type ReviewPathTarget =
  | { kind: "overview" }
  | { kind: "recap" }
  | { kind: "diffs"; diffView: DiffView };

/**
 * Map legacy `?prTab=` / `?diffView=` (or defaults) onto a Review path target.
 * Used when redirecting bare `/review` and old query-backed URLs.
 */
export function reviewPathFromSearch(search: {
  prTab?: unknown;
  diffView?: unknown;
}): ReviewPathTarget {
  if (typeof search.prTab === "string" && isReviewTab(search.prTab)) {
    if (search.prTab === "overview") return { kind: "overview" };
    if (search.prTab === "recap") return { kind: "recap" };
  }
  const diffView =
    typeof search.diffView === "string" && isDiffView(search.diffView)
      ? search.diffView
      : "unified";
  return { kind: "diffs", diffView };
}
/**
 * Nuqs's TanStack adapter concatenates `pathname + '?file=…'`. TanStack
 * resolvePath keeps the `?…` inside `$sandboxTab`, so the tab id must be
 * peeled before comparing or falling back to Preview.
 */
export function sandboxTabIdFromParam(raw: string): string {
  const q = raw.indexOf("?");
  return q === -1 ? raw : raw.slice(0, q);
}

function decodeCorruptedSearchValue(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  try {
    return raw.includes("%") ? decodeURIComponent(raw) : raw;
  } catch {
    return raw;
  }
}

/**
 * Peel a corrupted `$sandboxTab` (`files?file=/abs/path`) into a clean tab
 * plus the search keys that were trapped in the segment.
 */
export function splitCorruptedSandboxTabParam(raw: string): {
  tab: string;
  diffFile?: string;
  diffView?: DiffView;
  file?: string;
} | null {
  const q = raw.indexOf("?");
  if (q === -1) return null;
  const tab = raw.slice(0, q);
  const params = new URLSearchParams(raw.slice(q + 1));
  const diffFile = decodeCorruptedSearchValue(params.get("diffFile"));
  const file = decodeCorruptedSearchValue(params.get("file"));
  const diffViewRaw = params.get("diffView");
  const diffView: DiffView | undefined =
    diffViewRaw === "unified" || diffViewRaw === "split"
      ? diffViewRaw
      : undefined;
  return { tab, diffFile, diffView, file };
}

/** Search fields used by the PR/Diffs tab (quick-tasks validateSearch must allow these). */
export function parseDiffSearchFields(search: {
  diffFile?: string;
  diffView?: string;
  prTab?: string;
}): {
  diffFile: string | undefined;
  diffView: DiffView | undefined;
  prTab: ReviewTab | undefined;
} {
  return {
    diffFile: typeof search.diffFile === "string" ? search.diffFile : undefined,
    diffView:
      search.diffView === "unified" || search.diffView === "split"
        ? search.diffView
        : undefined,
    prTab:
      typeof search.prTab === "string" && isReviewTab(search.prTab)
        ? search.prTab
        : undefined,
  };
}

/**
 * The comment anchor a notification click-through carries. A route with a
 * `validateSearch` drops any key it does not name, so every route a comment
 * notification can land on has to spread this in — otherwise TanStack strips
 * the param before nuqs ever sees it.
 */
export function parseCommentAnchorSearchField(search: { comment?: string }): {
  comment?: string;
} {
  // Optional rather than `comment: string | undefined`: TanStack derives the
  // route's search type from this return, and a required-but-undefined key
  // would force every `navigate({ search })` under the route to restate it.
  return typeof search.comment === "string" ? { comment: search.comment } : {};
}

export const designVariationParser = parseAsString
  .withDefault("0")
  .withOptions(tabOptions);

const viewModes = ["desktop", "mobile"] as const;
export const viewModeParser = parseAsStringLiteral(viewModes)
  .withDefault("desktop")
  .withOptions(tabOptions);

const snapshotSettingsTabs = [
  "configuration",
  "status",
  "builds",
  "config-files",
] as const;
export type SnapshotSettingsTab = (typeof snapshotSettingsTabs)[number];

export function isSnapshotSettingsTab(s: string): s is SnapshotSettingsTab {
  return snapshotSettingsTabs.some((tab) => tab === s);
}

// `content`/`html` are PRD docs; `recap`/`summary` are PR-recap docs.
// Legacy recap URLs still use `html`/`content` and canonicalize at the viewer.
const docViewerTabs = ["content", "html", "recap", "summary"] as const;
export type DocViewerTab = (typeof docViewerTabs)[number];

export function isDocViewerTab(s: string): s is DocViewerTab {
  return docViewerTabs.some((tab) => tab === s);
}

export const DOC_VIEWER_DEFAULT_TAB: DocViewerTab = "content";

/** Canonical recap sub-tabs (legacy `html`→recap, `content`→summary). */
export type RecapDocTab = "recap" | "summary";

export function canonicalizeRecapDocTab(tab: DocViewerTab): RecapDocTab {
  if (tab === "summary" || tab === "content") return "summary";
  return "recap";
}

const docModes = ["editing", "suggesting", "viewing"] as const;
export type DocMode = (typeof docModes)[number];
export const docModeParser = parseAsStringLiteral(docModes)
  .withDefault("editing")
  .withOptions(searchOptions);

const docCommentFilters = ["open", "resolved"] as const;
export const docCommentFilterParser = parseAsStringLiteral(docCommentFilters)
  .withDefault("open")
  .withOptions(searchOptions);

const automationTabs = ["latest", "run-history", "settings"] as const;
export type AutomationTab = (typeof automationTabs)[number];

export function isAutomationTab(s: string): s is AutomationTab {
  return automationTabs.some((tab) => tab === s);
}

export const AUTOMATION_DEFAULT_TAB: AutomationTab = "latest";

export const inboxFilters = ["all", "unread"] as const;
export type InboxFilter = (typeof inboxFilters)[number];
export const inboxFilterParser = parseAsStringLiteral(inboxFilters)
  .withDefault("all")
  .withOptions(searchOptions);

export function isInboxFilter(s: string): s is InboxFilter {
  return inboxFilters.some((filter) => filter === s);
}

// Selected notification id in the two-pane inbox, kept in the URL so the
// selection survives reload and a notification can be linked directly.
export const inboxSelectedParser = parseAsString.withOptions(searchOptions);

export const messagesScopes = ["mine", "team"] as const;
export type MessagesScope = (typeof messagesScopes)[number];
export function isMessagesScope(s: string): s is MessagesScope {
  return messagesScopes.some((scope) => scope === s);
}
export const messagesScopeParser = parseAsStringLiteral(messagesScopes)
  .withDefault("mine")
  .withOptions(searchOptions);

export const messagesThreadParser = parseAsString.withOptions(searchOptions);

// The comment a notification click-through is aimed at. Written by the backend
// into the notification href (`?comment=<id>`), never by the UI, so it replaces
// rather than pushes — going back should leave the page, not the highlight.
export const commentAnchorParser = parseAsString.withOptions(searchOptions);

const pullRequestListStates = ["open", "closed", "all"] as const;
export type PullRequestListState = (typeof pullRequestListStates)[number];
export const pullRequestListStateParser = parseAsStringLiteral(
  pullRequestListStates,
)
  .withDefault("open")
  .withOptions(searchOptions);

export const previewPortParser = parseAsInteger.withOptions(searchOptions);

export const branchParser = parseAsString
  .withDefault("main")
  .withOptions(searchOptions);

const envVarScopes = ["repo", "team"] as const;
export type EnvVarScope = (typeof envVarScopes)[number];

export function isEnvVarScope(s: string): s is EnvVarScope {
  return envVarScopes.some((scope) => scope === s);
}

const teamDetailTabs = [
  "activity",
  "members",
  "codebases",
  "env",
  "artifacts",
] as const;
export type TeamDetailTab = (typeof teamDetailTabs)[number];

export function isTeamDetailTab(s: string): s is TeamDetailTab {
  return teamDetailTabs.some((tab) => tab === s);
}

const logViews = ["overview", "type", "project"] as const;
export const logViewParser = parseAsStringLiteral(logViews)
  .withDefault("overview")
  .withOptions(searchOptions);
