"use node";

import { v } from "convex/values";
import { z } from "zod";
import { action } from "./_generated/server";
import { resolveAllEnvVars } from "./envVarResolver";
import { getActionRepoWithAccess } from "./functions";
import { isSandboxIdentity } from "./_auth/sandboxIdentity";

const LINEAR_API_URL = "https://api.linear.app/graphql";

interface LinearIssue {
  identifier: string;
  title: string;
  description: string;
}

// Boundary schema for the Linear GraphQL response. Each aliased issue may be
// null (missing/unknown id) or fail validation (wrong shape) — `.catch(null)`
// turns any per-issue failure into a skip, matching the old guard behaviour.
const linearIssueSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  description: z.string().catch(""),
});

const linearResponseSchema = z.object({
  data: z.record(z.string(), linearIssueSchema.nullable().catch(null)),
});

/** Fetches Linear issues by their identifiers using the Linear GraphQL API. */
export const fetchIssues = action({
  args: {
    repoId: v.id("githubRepos"),
    identifiers: v.array(v.string()),
  },
  returns: v.array(
    v.object({
      identifier: v.string(),
      title: v.string(),
      description: v.string(),
    }),
  ),
  handler: async (ctx, args): Promise<LinearIssue[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    if (isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
    }
    await getActionRepoWithAccess(ctx, args.repoId);
    const envVars = await resolveAllEnvVars(ctx, args.repoId);
    const apiKey = envVars.LINEAR_API_KEY;

    if (!apiKey) {
      throw new Error(
        "LINEAR_API_KEY not found in team or repo environment variables. Please add it to your team or repo env vars.",
      );
    }

    if (args.identifiers.length === 0) {
      return [];
    }
    if (args.identifiers.length > 50) {
      throw new Error("At most 50 Linear issues can be fetched at once");
    }
    if (args.identifiers.some((identifier) => identifier.length > 100)) {
      throw new Error("Linear issue identifiers must be 100 characters or less");
    }

    const variables = Object.fromEntries(
      args.identifiers.map((identifier, index) => [`issue${index}`, identifier]),
    );
    const variableDeclarations = args.identifiers
      .map((_identifier, index) => `$issue${index}: String!`)
      .join(", ");

    const fieldsQuery = `
      query (${variableDeclarations}) {
        ${args.identifiers
          .map(
            (_identifier, idx) => `
          issue${idx}: issue(id: $issue${idx}) {
            identifier
            title
            description
          }
        `,
          )
          .join("\n")}
      }
    `;

    const response = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ query: fieldsQuery, variables }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Linear API request failed (${response.status}): ${text}`,
      );
    }

    const parsed = linearResponseSchema.safeParse(await response.json());

    if (!parsed.success) {
      throw new Error("Invalid Linear API response: missing data field");
    }

    const results: LinearIssue[] = [];

    for (let i = 0; i < args.identifiers.length; i++) {
      const issue = parsed.data.data[`issue${i}`];
      if (!issue) continue;
      results.push(issue);
    }

    return results;
  },
});
