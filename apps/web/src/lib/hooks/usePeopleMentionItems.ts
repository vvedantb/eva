"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { peopleMentionItems } from "@eva/shared";
import type { MentionItem } from "@/lib/components/mentions";

/**
 * Loads the teammates who can be `@`-mentioned in a repo. Shared by every
 * mention surface (chat composers, comment inputs) so the picker offers the
 * same people everywhere and notifications only ever target team members.
 */
export function usePeopleMentionItems(
  repoId: Id<"githubRepos"> | undefined,
): MentionItem<Id<"users">>[] {
  const members = useQuery(
    api.teamMembers.listForRepo,
    repoId ? { repoId } : "skip",
  );
  return members ? peopleMentionItems(members) : [];
}
