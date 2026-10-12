"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api, type AIProvider, type Id } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Textarea,
  Spinner,
  ProviderIcon,
  cn,
} from "@eva/ui";
import { PROVIDER_CREDENTIAL_FIELDS, PROVIDER_LABELS } from "./_credentialSpec";
import { withMutationToast } from "@/lib/utils/mutationToast";

const PROVIDERS: ReadonlyArray<AIProvider> = [
  "claude",
  "cursor",
  "codex",
  "opencode",
];

/** The existing account being edited (values arrive masked; revealed on open). */
export interface EditingAccount {
  _id: Id<"userProviderAccounts">;
  provider: AIProvider;
  label: string;
  credentialKeys: ReadonlyArray<string>;
}

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: EditingAccount | null;
}

/**
 * Create or edit a provider account. Label is derived from the user's first
 * name server-side — this dialog only collects provider and secrets.
 */
export function AddAccountDialog({
  open,
  onOpenChange,
  editing,
}: AddAccountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Remount when opened/editing target changes so draft state resets. */}
        {open ? (
          <AddAccountForm
            key={editing?._id ?? "new"}
            editing={editing}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AddAccountForm({
  editing,
  onOpenChange,
}: {
  editing: EditingAccount | null;
  onOpenChange: (open: boolean) => void;
}) {
  const upsert = useAction(api.userProviderAccountsActions.upsert);
  const revealValue = useAction(api.userProviderAccountsActions.revealValue);

  const [provider, setProvider] = useState<AIProvider>(
    editing?.provider ?? "claude",
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(editing !== null);

  // Reveal masked credentials once on mount when editing an existing account.
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        editing.credentialKeys.map(async (key) => {
          const value = await revealValue({ accountId: editing._id, key });
          return value !== null ? ([key, value] as const) : null;
        }),
      );
      if (cancelled) return;
      const revealed: Record<string, string> = {};
      for (const entry of entries) {
        if (entry) revealed[entry[0]] = entry[1];
      }
      setValues(revealed);
      setPrefilling(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, revealValue]);

  const fields = PROVIDER_CREDENTIAL_FIELDS[provider];
  const canSave = fields.every(
    (field) => !field.required || (values[field.key]?.trim().length ?? 0) > 0,
  );

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const credentials = fields.flatMap((field) => {
      const value = values[field.key]?.trim() ?? "";
      return value.length > 0 ? [{ key: field.key, value }] : [];
    });
    // Built out here: ternaries and optional chaining inside the `try` bail the
    // React Compiler out of this whole file. See CLAUDE.md.
    const accountId = editing?._id;
    const successMessage = editing ? "Account updated" : "Account added";
    const errorMessage = editing
      ? "Couldn't update account"
      : "Couldn't add account";
    try {
      await withMutationToast(
        upsert({
          accountId,
          provider,
          credentials,
        }),
        successMessage,
        errorMessage,
        "account-upsert",
      );
      onOpenChange(false);
    } catch {
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit account" : "Add account"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Provider
          </p>
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map((option) => (
              <button
                key={option}
                type="button"
                disabled={editing !== null}
                onClick={() => setProvider(option)}
                className={cn(
                  // `max-sm:min-h-10` lifts the 30px chip to a comfortable tap
                  // target on touch without changing the desktop density.
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors max-sm:min-h-10",
                  provider === option
                    ? "border-border bg-muted text-foreground"
                    : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/60",
                  editing !== null && "cursor-not-allowed opacity-60",
                )}
              >
                <ProviderIcon provider={option} size={14} />
                {PROVIDER_LABELS[option]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-2xs text-muted-foreground">
            Shown as your first name with this provider&apos;s icon.
          </p>
        </div>

        {prefilling ? (
          <div className="flex items-center justify-center py-6">
            <Spinner />
          </div>
        ) : (
          fields.map((field) => (
            <div key={field.key}>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                {field.label}
              </p>
              {field.multiline ? (
                <Textarea
                  value={values[field.key] ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      [field.key]: event.target.value,
                    }))
                  }
                  placeholder={field.placeholder}
                  aria-label={field.label}
                  className="h-28 font-mono text-xs"
                />
              ) : (
                <Input
                  type="text"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                  value={values[field.key] ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      [field.key]: event.target.value,
                    }))
                  }
                  placeholder={field.placeholder}
                  aria-label={field.label}
                  className="h-8 font-mono text-xs"
                  autoFocus={field === fields[0]}
                />
              )}
            </div>
          ))
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave || saving}>
          {saving && <Spinner size="sm" className="mr-1.5" />}
          {editing ? "Save" : "Add account"}
        </Button>
      </DialogFooter>
    </>
  );
}
