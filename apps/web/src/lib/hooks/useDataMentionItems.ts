"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { dataMentionItems } from "@eva/shared";
import type { MentionItem } from "@/lib/components/mentions";

/** Loads Data `@` mention candidates (docs, sessions, projects, quick tasks). */
export function useDataMentionItems(
  repoId: Id<"githubRepos"> | undefined,
): MentionItem[] {
  const data = useQuery(api.mentions.listData, repoId ? { repoId } : "skip");
  return data ? dataMentionItems(data) : [];
}
