import { v } from "convex/values";
import { authQuery, sessionVisibleToUser } from "./functions";
import {
  gatherAccessibleRepos,
  repoBasePath,
  repoDisplayLabel,
} from "./_githubRepos/helpers";
import { filterActiveEntities, isEntityDeleted } from "./numId";
import type { Doc } from "./_generated/dataModel";
import { resolveExperimentalFlags } from "./_auth/experimentalFlags";

const DEFAULT_LIMIT = 40;
/** Bound per-repo reads so cross-repo search stays within Convex budgets. */
const PER_REPO_TAKE = 200;

const spotlightTypeValidator = v.union(
  v.literal("page"),
  v.literal("repo"),
  v.literal("team"),
  v.literal("project"),
  v.literal("task"),
  v.literal("session"),
  v.literal("doc"),
  v.literal("automation"),
  v.literal("artifact"),
);

const spotlightHitValidator = v.object({
  type: spotlightTypeValidator,
  title: v.string(),
  subtitle: v.string(),
  href: v.string(),
});

type SpotlightHit = {
  type:
    | "page"
    | "repo"
    | "team"
    | "project"
    | "task"
    | "session"
    | "doc"
    | "automation"
    | "artifact";
  title: string;
  subtitle: string;
  href: string;
  /** Lower is better; used only while building the response. */
  rank: number;
};

const GLOBAL_PAGES: Array<{ title: string; href: string; keywords: string }> = [
  { title: "Home", href: "/home", keywords: "home dashboard" },
  { title: "Inbox", href: "/inbox", keywords: "inbox notifications" },
  { title: "Sessions", href: "/sessions", keywords: "sessions" },
  { title: "Artifacts", href: "/artifacts", keywords: "artifacts html" },
  { title: "Teams", href: "/teams", keywords: "teams" },
];

const REPO_PAGES: Array<{ title: string; path: string; keywords: string }> = [
  { title: "Projects", path: "/projects", keywords: "projects ship build" },
  {
    title: "Quick Tasks",
    path: "/quick-tasks",
    keywords: "quick tasks fix",
  },
  { title: "Sessions", path: "/sessions", keywords: "sessions" },
  { title: "Documents", path: "/docs", keywords: "documents docs prd" },
  { title: "Reviews", path: "/reviews", keywords: "reviews pull requests" },
  {
    title: "Testing Arena",
    path: "/testing-arena",
    keywords: "testing arena tests",
  },
  {
    title: "Automations",
    path: "/automations",
    keywords: "automations cron",
  },
  { title: "Stats", path: "/stats", keywords: "stats analytics" },
  {
    title: "Settings",
    path: "/settings/config",
    keywords: "settings config",
  },
  { title: "Drafts", path: "/drafts", keywords: "drafts" },
  { title: "Designs", path: "/designs", keywords: "designs" },
];

function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

function matchesQuery(haystack: string, query: string): boolean {
  if (query.length === 0) return true;
  return haystack.toLowerCase().includes(query);
}

function rankMatch(title: string, query: string): number {
  if (query.length === 0) return 50;
  const lower = title.toLowerCase();
  if (lower === query) return 0;
  if (lower.startsWith(query)) return 10;
  const idx = lower.indexOf(query);
  if (idx >= 0) return 20 + idx;
  return 100;
}

function pushHit(hits: SpotlightHit[], hit: SpotlightHit, limit: number) {
  if (hits.length >= limit * 3) return;
  hits.push(hit);
}

function isTeamDoc(team: Doc<"teams"> | null): team is Doc<"teams"> {
  return team !== null;
}

/**
 * Cross-repo/team spotlight: titles/names the caller can open.
 * Empty query → global pages + repos/teams. Non-empty → also entity titles.
 */
export const search = authQuery({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(spotlightHitValidator),
  handler: async (ctx, args) => {
    const limit =
      args.limit !== undefined && args.limit > 0
        ? Math.min(args.limit, 80)
        : DEFAULT_LIMIT;
    const query = normalizeQuery(args.query);
    const hits: SpotlightHit[] = [];
    const user = await ctx.db.get(ctx.userId);
    const simpleView = resolveExperimentalFlags(user).simpleView;

    for (const page of GLOBAL_PAGES) {
      const haystack = `${page.title} ${page.keywords}`;
      if (!matchesQuery(haystack, query)) continue;
      pushHit(
        hits,
        {
          type: "page",
          title: page.title,
          subtitle: "App",
          href: page.href,
          rank: rankMatch(page.title, query),
        },
        limit,
      );
    }

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();

    const teams = (
      await Promise.all(memberships.map((m) => ctx.db.get(m.teamId)))
    ).filter(isTeamDoc);

    for (const team of teams) {
      if (!matchesQuery(team.name, query)) continue;
      pushHit(
        hits,
        {
          type: "team",
          title: team.name,
          subtitle: "Team",
          href: `/teams/${team._id}`,
          rank: rankMatch(team.name, query),
        },
        limit,
      );
    }

    const repos = await gatherAccessibleRepos(ctx.db, ctx.userId, false);
    let repoPagesAdded = 0;

    for (const repo of repos) {
      const label = repoDisplayLabel(repo);
      const base = repoBasePath(repo);
      const repoHaystack = `${label} ${repo.owner} ${repo.name} ${repo.rootDirectory ?? ""}`;
      if (matchesQuery(repoHaystack, query)) {
        pushHit(
          hits,
          {
            type: "repo",
            title: label,
            subtitle: `${repo.owner}/${repo.name}`,
            href: base,
            rank: rankMatch(label, query),
          },
          limit,
        );
      }

      // Per-repo nav pages: only when typing (avoids N×pages noise when empty).
      if (query.length > 0 && repoPagesAdded < 8) {
        for (const page of REPO_PAGES) {
          if (simpleView && page.path === "/reviews") continue;
          if (simpleView && page.path === "/automations") continue;
          const pagePath =
            simpleView && page.path === "/settings/config"
              ? "/settings/skills"
              : page.path;
          if (repoPagesAdded >= 8) break;
          if (!matchesQuery(`${page.title} ${page.keywords}`, query)) continue;
          pushHit(
            hits,
            {
              type: "page",
              title: page.title,
              subtitle: label,
              href: `${base}${pagePath}`,
              rank: rankMatch(page.title, query) + 5,
            },
            limit,
          );
          repoPagesAdded += 1;
        }
      }
    }

    // Artifacts are team-scoped (not per-repo).
    if (query.length > 0) {
      const teamNameById = new Map(
        teams.map((team) => [String(team._id), team.name]),
      );
      for (const membership of memberships) {
        const artifacts = await ctx.db
          .query("artifacts")
          .withIndex("by_team", (q) => q.eq("boundTeamId", membership.teamId))
          .take(PER_REPO_TAKE);
        for (const artifact of artifacts) {
          if (!matchesQuery(artifact.name, query)) continue;
          pushHit(
            hits,
            {
              type: "artifact",
              title: artifact.name,
              subtitle:
                teamNameById.get(String(artifact.boundTeamId)) ?? "Artifact",
              href: `/artifacts/${artifact._id}`,
              rank: rankMatch(artifact.name, query) + 15,
            },
            limit,
          );
        }
      }
    }

    if (query.length > 0) {
      await Promise.all(
        repos.map(async (repo) => {
          const label = repoDisplayLabel(repo);
          const base = repoBasePath(repo);

          const [projects, sessions, tasks, docs, automations] =
            await Promise.all([
              ctx.db
                .query("projects")
                .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
                .take(PER_REPO_TAKE),
              ctx.db
                .query("sessions")
                .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
                .take(PER_REPO_TAKE),
              ctx.db
                .query("agentTasks")
                .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
                .take(PER_REPO_TAKE),
              ctx.db
                .query("docs")
                .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
                .take(PER_REPO_TAKE),
              ctx.db
                .query("automations")
                .withIndex("by_repo", (q) => q.eq("repoId", repo._id))
                .take(PER_REPO_TAKE),
            ]);

          for (const project of filterActiveEntities(projects)) {
            if (project.numId === undefined) continue;
            if (!matchesQuery(project.title, query)) continue;
            pushHit(
              hits,
              {
                type: "project",
                title: project.title,
                subtitle: label,
                href: `${base}/projects/${project.numId}`,
                rank: rankMatch(project.title, query) + 20,
              },
              limit,
            );
          }

          for (const session of filterActiveEntities(sessions)) {
            if (!sessionVisibleToUser(session, ctx.userId)) continue;
            if (session.archived === true) continue;
            if (session.numId === undefined) continue;
            if (!matchesQuery(session.title, query)) continue;
            pushHit(
              hits,
              {
                type: "session",
                title: session.title,
                subtitle: label,
                href: `${base}/sessions/${session.numId}`,
                rank: rankMatch(session.title, query) + 20,
              },
              limit,
            );
          }

          for (const task of filterActiveEntities(tasks)) {
            if (task.status === "draft") continue;
            if (task.numId === undefined) continue;
            if (!matchesQuery(task.title, query)) continue;
            pushHit(
              hits,
              {
                type: "task",
                title: task.title,
                subtitle: label,
                href: `${base}/quick-tasks/${task.numId}`,
                rank: rankMatch(task.title, query) + 20,
              },
              limit,
            );
          }

          for (const doc of docs) {
            if (isEntityDeleted(doc)) continue;
            if (doc.numId === undefined) continue;
            if (!matchesQuery(doc.title, query)) continue;
            pushHit(
              hits,
              {
                type: "doc",
                title: doc.title,
                subtitle: label,
                href: `${base}/docs/${doc.numId}/content`,
                rank: rankMatch(doc.title, query) + 20,
              },
              limit,
            );
          }

          if (!simpleView) {
            for (const automation of filterActiveEntities(automations)) {
              if (automation.numId === undefined) continue;
              if (!matchesQuery(automation.title, query)) continue;
              pushHit(
                hits,
                {
                  type: "automation",
                  title: automation.title,
                  subtitle: label,
                  href: `${base}/automations/${automation.numId}`,
                  rank: rankMatch(automation.title, query) + 20,
                },
                limit,
              );
            }
          }
        }),
      );
    }

    hits.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));

    return hits.slice(0, limit).map(({ type, title, subtitle, href }) => ({
      type,
      title,
      subtitle,
      href,
    }));
  },
});
