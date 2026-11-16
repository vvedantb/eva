import { api, type Id, type PrOwnerRef } from "@eva/backend";
import { isLivePrState, orderPrsLiveFirst, prNumberFromGithubUrl, pullRequestsMenuLabel } from "@eva/shared";
import { IconExternalLink, IconGitPullRequest, IconGitPullRequestClosed, IconLink, IconStack2 } from "@tabler/icons-react-native";
import { SheetRow } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking } from "react-native";
import { useSimpleView } from "@/chat/ComposerFooter";
import { PrCloseDialog, type PrCloseTarget } from "@/reviews/PrCloseDialog";
import { prStatusAppearance } from "@/reviews/prAppearance";
import { MenuDivider, MenuSheet, SubmenuRow } from "@/ui/MenuSheet";
import { useScheme } from "@/ui/theme";

type OwnerPr = FunctionReturnType<typeof api.pullRequests.listForOwner>[number];

/**
 * Every PR linked to a session, quick task or project
 * (`pullRequests.listForOwner`), for a "…" menu to label its PR row: one PR
 * keeps "Open PR", two or more read "Pull requests (N)" and open
 * `usePullRequestsSheet`. Skipped in simple view, which hides PR plumbing, as
 * the web; and with no owner yet.
 */
export function useOwnerPullRequests(owner: PrOwnerRef | undefined): OwnerPr[] {
  const simpleView = useSimpleView();
  return useQuery(api.pullRequests.listForOwner, owner && !simpleView ? { owner } : "skip") ?? [];
}

/** Opens a PR: the phone's PR screen when the URL names a PR in a known repo, else the browser. */
export function useOpenPr() {
  const router = useRouter();
  return (prUrl: string, repoId: Id<"githubRepos"> | undefined) => {
    const prNumber = prNumberFromGithubUrl(prUrl);
    if (prNumber !== undefined && repoId) {
      router.push({ pathname: "/review/[repoId]/[prNumber]", params: { repoId, prNumber: String(prNumber) } });
    } else {
      void Linking.openURL(prUrl);
    }
  };
}

/**
 * A task's or project's "View PR" sheet row, as the web `usePrLinkMenuItems`:
 * one PR opens it, two or more read "Pull requests (N)" and open the list
 * sheet. `prUrl` is the owner's own field, for a PR that predates the
 * `pullRequests` rows. Hidden in simple view. Render `sheet` once, outside
 * the "…" sheet.
 */
export function useOwnerPrRow(owner: PrOwnerRef | undefined, prUrl: string | undefined, repoId: Id<"githubRepos"> | undefined) {
  const simpleView = useSimpleView();
  const prs = useOwnerPullRequests(owner);
  const prSheet = usePullRequestsSheet();
  const openPr = useOpenPr();
  const url = prUrl ?? prs[0]?.prUrl;
  const row = (close: () => void) =>
    simpleView || !owner || url === undefined ? null : prs.length > 1 ? (
      <SubmenuRow
        icon={IconGitPullRequest}
        title={pullRequestsMenuLabel(prs.length)}
        onPress={() => {
          close();
          prSheet.openFor(owner);
        }}
      />
    ) : (
      <SheetRow
        icon={IconGitPullRequest}
        title="View PR"
        onPress={() => {
          close();
          openPr(url, repoId ?? prs[0]?.repoId);
        }}
      />
    );
  return { row, sheet: prSheet.sheet };
}

/** The "…" menu label of a chat's PR row: "Pull requests (N)" for several, else the given one-PR label. */
export function prRowLabel(prs: readonly OwnerPr[], single: string): string {
  return prs.length > 1 ? pullRequestsMenuLabel(prs.length) : single;
}

/**
 * The web `PrActionsSubmenus` of a chat's "…" menu as one bottom sheet: the
 * list page has a row per PR (its state icon and colour, title, `#N` and
 * state), open and draft first; a tap opens that PR's page with the web
 * per-PR actions: Open PR (the phone's PR screen), View on GitHub, Copy link,
 * and, while it is open or a draft, Stack a new session and Close without
 * merging (behind the web confirm). `openFor` shows it for one owner; render
 * `sheet` once.
 */
export function usePullRequestsSheet() {
  const scheme = useScheme();
  const router = useRouter();
  const openPr = useOpenPr();
  const [owner, setOwner] = useState<PrOwnerRef | null>(null);
  const [pickedId, setPickedId] = useState<OwnerPr["_id"] | null>(null);
  const [closeTarget, setCloseTarget] = useState<PrCloseTarget | null>(null);
  const prs = orderPrsLiveFirst(useOwnerPullRequests(owner ?? undefined));
  // Read from the live list, so a PR closed elsewhere shows its new state here.
  const picked = pickedId === null ? undefined : prs.find((pr) => pr._id === pickedId);

  const dismiss = () => {
    setOwner(null);
    setPickedId(null);
  };
  const openFor = (next: PrOwnerRef) => {
    setPickedId(null);
    setOwner(next);
  };
  // Leaves the sheet first: the next screen or dialog must not open under it.
  const act = (run: () => void) => {
    dismiss();
    run();
  };

  const sheet = (
    <>
      <MenuSheet
        open={owner !== null}
        onOpenChange={(open) => {
          if (!open) dismiss();
        }}
        title={picked ? `#${picked.prNumber} ${picked.title ?? ""}`.trim() : pullRequestsMenuLabel(prs.length)}
        onBack={picked ? () => setPickedId(null) : undefined}
      >
        {picked ? (
          <PrActions
            pr={picked}
            onOpen={() => act(() => openPr(picked.prUrl, picked.repoId))}
            onStack={(headBranch) =>
              act(() =>
                router.push({
                  pathname: "/session/new",
                  params: { repo: picked.repoId, stackOn: String(picked.prNumber), stackBase: headBranch },
                }),
              )
            }
            onClose={() => act(() => setCloseTarget({ repoId: picked.repoId, prNumber: picked.prNumber }))}
            onDone={dismiss}
          />
        ) : (
          prs.map((pr) => {
            const state = prStatusAppearance(pr.state === "draft" ? "open" : pr.state, pr.state === "draft", scheme);
            const StateIcon = state.icon;
            return (
              <SubmenuRow
                key={pr._id}
                leading={<StateIcon size={20} color={state.text} />}
                title={pr.title ?? `Pull request #${pr.prNumber}`}
                detail={`#${pr.prNumber} · ${state.label}`}
                onPress={() => setPickedId(pr._id)}
              />
            );
          })
        )}
      </MenuSheet>
      <PrCloseDialog
        target={closeTarget}
        onOpenChange={(open) => {
          if (!open) setCloseTarget(null);
        }}
      />
    </>
  );

  return { openFor, sheet };
}

/** One PR's page: the web `PrActionItems`, with Open PR first, as the phone has a PR screen. */
function PrActions({
  pr,
  onOpen,
  onStack,
  onClose,
  onDone,
}: {
  pr: OwnerPr;
  onOpen: () => void;
  onStack: (headBranch: string) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const live = isLivePrState(pr.state);
  const headBranch = pr.headBranch;
  return (
    <>
      <SheetRow icon={IconGitPullRequest} title="Open PR" onPress={onOpen} />
      <SheetRow
        icon={IconExternalLink}
        title="View on GitHub"
        onPress={() => {
          onDone();
          void Linking.openURL(pr.prUrl);
        }}
      />
      <SheetRow
        icon={IconLink}
        title="Copy link"
        onPress={() => {
          onDone();
          void Clipboard.setStringAsync(pr.prUrl).then(
            () => toast.success("Link copied"),
            () => toast.error("Couldn't copy the link"),
          );
        }}
      />
      {live && headBranch !== undefined ? (
        <SheetRow icon={IconStack2} title="Stack a new session" onPress={() => onStack(headBranch)} />
      ) : null}
      {live ? (
        <>
          <MenuDivider />
          {/* Closing notifies every reviewer and stops CI, so it asks first, as the web. */}
          <SheetRow icon={IconGitPullRequestClosed} title="Close without merging" danger onPress={onClose} />
        </>
      ) : null}
    </>
  );
}
