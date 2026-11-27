"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api, type Id } from "@eva/backend";
import { toast } from "@vvedantb/ui";
import { prErrorMessage } from "@/lib/prReviewQueries";

type Candidates = {
  users: { login: string; avatarUrl: string | null }[];
  labels: { name: string; color: string; description: string | null }[];
};

/**
 * The three editable metadata fields, behind one hook.
 *
 * Candidates are one request for all three — collaborators and labels come from
 * the same round trip — read with `enabled: false` so opening the page does not
 * fetch a list nobody asked for. `loadCandidates` is what the first pencil click
 * runs, and it fills the shared cache entry, so the other two open instantly.
 *
 * Each save calls `onSaved` rather than patching the overview locally: GitHub is
 * the source of truth for these, and the action drops the server-side cache
 * before returning, so a refetch is both correct and cheap.
 */
export function usePrMetaEdit(
  repoId: Id<"githubRepos">,
  prNumber: number,
  onSaved: () => void,
): {
  candidates: Candidates | undefined;
  loading: boolean;
  loadCandidates: () => void;
  setReviewers: (logins: string[]) => void;
  setAssignees: (logins: string[]) => void;
  setLabels: (names: string[]) => void;
  savingReviewers: boolean;
  savingAssignees: boolean;
  savingLabels: boolean;
} {
  const listCandidates = useAction(api.github.listPullRequestCandidates);
  const setReviewersAction = useAction(api.github.setPullRequestReviewers);
  const setAssigneesAction = useAction(api.github.setPullRequestAssignees);
  const setLabelsAction = useAction(api.github.setPullRequestLabels);
  const queryClient = useQueryClient();

  const options = {
    queryKey: ["pr-meta-candidates", repoId] as const,
    queryFn: () => listCandidates({ repoId }),
    staleTime: 5 * 60 * 1000,
  };
  const cached = useQuery({ ...options, enabled: false });
  const load = useMutation({
    mutationFn: () => queryClient.fetchQuery(options),
  });

  // Spelled out three times rather than built by a helper: `useMutation` is a
  // hook, and a hook called from a closure is a lint error and a footgun the
  // moment one of the three becomes conditional.
  const reviewers = useMutation({
    mutationFn: (logins: string[]) =>
      setReviewersAction({ repoId, prNumber, logins }),
    onSuccess: () => onSaved(),
    onError: (error) =>
      toast.error(prErrorMessage(error, "Couldn't change the reviewers")),
  });
  const assignees = useMutation({
    mutationFn: (logins: string[]) =>
      setAssigneesAction({ repoId, prNumber, logins }),
    onSuccess: () => onSaved(),
    onError: (error) =>
      toast.error(prErrorMessage(error, "Couldn't change the assignees")),
  });
  const labels = useMutation({
    mutationFn: (names: string[]) =>
      setLabelsAction({ repoId, prNumber, names }),
    onSuccess: () => onSaved(),
    onError: (error) =>
      toast.error(prErrorMessage(error, "Couldn't change the labels")),
  });

  return {
    candidates: cached.data,
    loading: load.isPending || cached.isFetching,
    loadCandidates: () => load.mutate(),
    setReviewers: (logins) => reviewers.mutate(logins),
    setAssignees: (logins) => assignees.mutate(logins),
    setLabels: (names) => labels.mutate(names),
    savingReviewers: reviewers.isPending,
    savingAssignees: assignees.isPending,
    savingLabels: labels.isPending,
  };
}
