"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import type { ModelAccount } from "@vvedantb/ui";
import {
  api,
  getSimpleViewModelOptions,
  getVisibleAIModelOptions,
  normalizeAIModel,
  type Id,
} from "@eva/backend";
import { toPickerAccounts } from "@eva/shared";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";

export function useAvailableAiModels(
  repoId: Id<"githubRepos"> | null | undefined,
  currentModel?: string | null,
) {
  const availability = useQuery(
    api.githubRepos.getProviderAvailability,
    repoId ? { repoId } : "skip",
  );
  const simpleView = useSimpleView();

  const normalizedModel = normalizeAIModel(currentModel);
  const visible = getVisibleAIModelOptions(availability, normalizedModel);
  const options = simpleView
    ? getSimpleViewModelOptions(visible, normalizedModel)
    : visible;

  return {
    availability,
    options,
    model: normalizedModel,
  };
}

function toModelAccounts(
  accounts: Parameters<typeof toPickerAccounts>[0] | undefined,
): {
  options: ReadonlyArray<ModelAccount>;
  resolveId: (id: string | null) => Id<"userProviderAccounts"> | undefined;
  ready: boolean;
} {
  const options: ReadonlyArray<ModelAccount> = toPickerAccounts(accounts ?? []);
  const resolveId = (
    id: string | null,
  ): Id<"userProviderAccounts"> | undefined =>
    id ? accounts?.find((account) => account._id === id)?._id : undefined;
  return { options, resolveId, ready: accounts !== undefined };
}

/**
 * The accounts the current user can run on — their own plus teammates' shared
 * ones — for pickers with no session or task yet.
 */
export function useProviderAccounts(): {
  options: ReadonlyArray<ModelAccount>;
  resolveId: (id: string | null) => Id<"userProviderAccounts"> | undefined;
  ready: boolean;
} {
  const accounts = useQuery(api.userProviderAccounts.listSelectable, {});
  return toModelAccounts(accounts);
}

/**
 * Accounts the task owner can run on, for the model picker (same shape as
 * `useProviderAccounts`). Used so teammates see the sticky owner's groups.
 */
export function useTaskOwnerProviderAccounts(
  taskId: Id<"agentTasks"> | null | undefined,
): {
  options: ReadonlyArray<ModelAccount>;
  resolveId: (id: string | null) => Id<"userProviderAccounts"> | undefined;
  ready: boolean;
} {
  const accounts = useQuery(
    api.userProviderAccounts.listForTaskOwner,
    taskId ? { taskId } : "skip",
  );
  return toModelAccounts(accounts);
}

/**
 * Accounts an automation's creator can run on, teammates' shared ones
 * included (same shape as `useProviderAccounts`). Runs bill to the creator's
 * pick whoever edits, so everyone sees the creator's accounts.
 */
export function useAutomationOwnerProviderAccounts(
  automationId: Id<"automations">,
): {
  options: ReadonlyArray<ModelAccount>;
  resolveId: (id: string | null) => Id<"userProviderAccounts"> | undefined;
  ready: boolean;
} {
  const accounts = useQuery(api.userProviderAccounts.listForAutomationOwner, {
    automationId,
  });
  return toModelAccounts(accounts);
}

/** Accounts the project owner can run on (same shape as `useProviderAccounts`). */
export function useProjectOwnerProviderAccounts(
  projectId: Id<"projects">,
): {
  options: ReadonlyArray<ModelAccount>;
  resolveId: (id: string | null) => Id<"userProviderAccounts"> | undefined;
  ready: boolean;
} {
  const accounts = useQuery(api.userProviderAccounts.listForProjectOwner, {
    projectId,
  });
  return toModelAccounts(accounts);
}

/**
 * Accounts the session owner can run on, for the model picker (same shape as
 * `useProviderAccounts`). A session runs on its owner's credentials whoever
 * sends the turn, so collaborators pick from the owner's accounts — showing
 * their own would list accounts the session can never use.
 */
export function useSessionOwnerProviderAccounts(
  sessionId: Id<"sessions"> | null | undefined,
  active = true,
): {
  options: ReadonlyArray<ModelAccount>;
  resolveId: (id: string | null) => Id<"userProviderAccounts"> | undefined;
  ready: boolean;
} {
  const accounts = useHeldQuery(
    api.userProviderAccounts.listForSessionOwner,
    sessionId && active ? { sessionId } : "skip",
  );
  return toModelAccounts(accounts);
}
