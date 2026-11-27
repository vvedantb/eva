"use client";

import { UsageLimitsIndicator } from "@/lib/components/usage-limits";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  usageAccountLabel,
  type SandboxChatBinding,
} from "./sandboxChatBinding";

/**
 * Plan usage for an owned sandbox chat (a quick task or a project), shown in
 * the page header as sessions do. Scoped to the chat's model and account.
 */
export function SandboxChatUsageLimits({
  binding,
}: {
  binding: SandboxChatBinding;
}) {
  const { repo } = useRepo();
  return (
    <UsageLimitsIndicator
      repoId={repo._id}
      model={binding.model}
      providerAccountId={binding.providerAccountId}
      accountLabel={usageAccountLabel(binding)}
    />
  );
}
