"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsEmptyState } from "@/lib/components/settings/SettingsEmptyState";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Spinner,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@eva/ui";
import { IconKey, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { relativeTime } from "@/lib/components/artifacts/_format";
import { PROVIDER_LABELS } from "./_credentialSpec";
import { AddAccountDialog, type EditingAccount } from "./AddAccountDialog";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";
import {
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";

/** Ties every sharing switch to the one visible explanation under the list. */
const SHARING_HELP_ID = "account-sharing-help";

/**
 * Per-user "bring your own account" management. A user adds their own coding
 * agent logins (Claude Code OAuth token, Cursor API key, Codex/opencode auth);
 * when selected in a session or task's model picker, that account's credentials
 * are injected at sandbox launch instead of the shared team credential, so the
 * usage bills to the user. Values are encrypted at rest and only revealed on
 * demand.
 */
export function AccountsClient() {
  const accounts = useQuery(api.userProviderAccounts.list, {});
  const remove = useMutation(api.userProviderAccounts.remove);
  const setShared = useMutation(api.userProviderAccounts.setShared);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EditingAccount | null>(null);
  const [deleteId, setDeleteId] = useState<Id<"userProviderAccounts"> | null>(
    null,
  );
  const altHeld = useAltHeld();

  const deleteAccount = (accountId: Id<"userProviderAccounts">) => {
    void withMutationToast(
      remove({ accountId }),
      "Account deleted",
      "Couldn't delete account",
      "account-delete",
    ).then(() => setDeleteId(null));
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (account: NonNullable<typeof accounts>[number]) => {
    setEditing({
      _id: account._id,
      provider: account.provider,
      label: account.label,
      credentialKeys: account.credentials.map((entry) => entry.key),
    });
    setDialogOpen(true);
  };

  return (
    <SettingsPage title="Accounts">
      <SettingsSection
        title="Your accounts"
        description="Your credentials are used before team credentials when you pick a model."
        action={
          <Button size="sm" onClick={openCreate}>
            <IconPlus size={16} className="mr-1.5" />
            Add account
          </Button>
        }
        // The list and its empty state manage their own padding.
        bodyVariant="list"
      >
        {accounts === undefined ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : accounts.length === 0 ? (
          <SettingsEmptyState
            icon={IconKey}
            title="No accounts yet"
            description="Add one to run agents on your own credentials instead of the team's."
          />
        ) : (
          <div className="divide-y divide-border/50">
            {accounts.map((account, index) => (
              <ListEnter
                key={account._id}
                index={index}
                className="flex max-sm:flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                {/* `basis-full` below `sm`: the share toggle plus two icon
                    buttons take the whole width of a phone, so the account
                    details own the first line and the controls the second. */}
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <p className="truncate text-sm font-medium">
                    {account.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {PROVIDER_LABELS[account.provider]} ·{" "}
                    {account.credentials.length} credential
                    {account.credentials.length !== 1 ? "s" : ""}
                  </p>
                  {/* A standing share is only safe if its owner can see it
                      being spent on, so surface who ran on it last. */}
                  {account.lastUsedAt !== undefined && (
                    <p className="truncate text-xs text-muted-foreground">
                      Last used{" "}
                      {account.lastUsedByName
                        ? `by ${account.lastUsedByName} `
                        : ""}
                      {/* Stamped by the server, so a few seconds of clock skew
                          would otherwise read as "in a few seconds". */}
                      {relativeTime(Math.min(account.lastUsedAt, Date.now()))}
                    </p>
                  )}
                </div>
                {/* Not a <label>: it would re-dispatch the click to the switch
                    and toggle it twice. */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  Share with team
                  <Switch
                    checked={account.shared}
                    onCheckedChange={(shared) =>
                      catchMutationError(
                        setShared({ accountId: account._id, shared }),
                        "Couldn't update sharing",
                        "account-share",
                      )
                    }
                    aria-label={`Share ${PROVIDER_LABELS[account.provider]} account with team`}
                    aria-describedby={SHARING_HELP_ID}
                  />
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => openEdit(account)}
                      aria-label="Edit"
                      className="max-sm:size-10"
                    >
                      <IconPencil size={14} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={(event) =>
                        requestConfirm(
                          altHeld,
                          () => setDeleteId(account._id),
                          () => deleteAccount(account._id),
                          event,
                        )
                      }
                      aria-label="Delete"
                      className="max-sm:size-10 text-destructive hover:text-destructive"
                    >
                      <IconTrash size={14} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{skipConfirmTitle("Delete")}</TooltipContent>
                </Tooltip>
              </ListEnter>
            ))}
            {/* The explanation of the switch, said once and visibly — it was a
                14-word `title`, which a touch user never sees at all. Each
                switch points at it with `aria-describedby`. */}
            <p
              id={SHARING_HELP_ID}
              className="px-4 py-3 text-xs text-muted-foreground"
            >
              Teammates can run sessions and tasks on a shared account. They can
              never see the credentials.
            </p>
          </div>
        )}
      </SettingsSection>

      <AddAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />

      <Dialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete this account? Sessions and tasks set to use it will fall back
            to the team credential. This cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (!deleteId) return;
                deleteAccount(deleteId);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
}
