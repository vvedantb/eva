"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  CrossfadeIcon,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from "@eva/ui";
import {
  IconCheck,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import type { EnvVar } from "@/lib/components/EnvVarsTable";
import type { EnvVarSlotEntry } from "@/lib/components/_utils/envVarSlotTypes";
import {
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";

interface EnvVarProviderSlotsProps {
  entries: ReadonlyArray<EnvVarSlotEntry>;
  /** sandboxExclude passed to onUpsert for new values from paste-in slots. */
  defaultSandboxExclude?: boolean;
  vars: EnvVar[] | undefined;
  onUpsert?: (
    key: string,
    value: string,
    sandboxExclude: boolean,
  ) => Promise<void>;
  onReveal?: (key: string) => Promise<string | null>;
  onRemove?: (key: string) => Promise<void>;
  readOnly?: boolean;
  removeDialogDescription?: string;
}

/**
 * Dedicated paste-in slots for known env vars (coding agents, infrastructure).
 * Each slot writes to the same free-form store as the table below via the shared
 * onUpsert/onReveal/onRemove callbacks — no extra backend surface.
 */
export function EnvVarProviderSlots({
  entries,
  defaultSandboxExclude = false,
  vars,
  onUpsert,
  onReveal,
  onRemove,
  readOnly = false,
  removeDialogDescription = "The agent it enables will stop working until you paste it again.",
}: EnvVarProviderSlotsProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealingKey, setRevealingKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const altHeld = useAltHeld();

  const matchOf = (entry: EnvVarSlotEntry): EnvVar | undefined =>
    vars?.find((v) => entry.matchKeys.includes(v.key));

  const sandboxExcludeFor = (entry: EnvVarSlotEntry): boolean =>
    entry.sandboxExclude ?? defaultSandboxExclude;

  const save = async (entry: EnvVarSlotEntry) => {
    const value = drafts[entry.id] ?? "";
    if (!value.trim() || !onUpsert) return;
    setSavingId(entry.id);
    await onUpsert(entry.primaryKey, value, sandboxExcludeFor(entry));
    setSavingId(null);
    setDrafts((prev) => ({ ...prev, [entry.id]: "" }));
  };

  const saveEdit = async (entry: EnvVarSlotEntry, matched: EnvVar) => {
    if (!editValue.trim() || !onUpsert) return;
    setSavingId(entry.id);
    await onUpsert(
      matched.key,
      editValue,
      sandboxExcludeFor(entry) ? true : matched.sandboxExclude,
    );
    setSavingId(null);
    setEditingId(null);
    setEditValue("");
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[matched.key];
      return next;
    });
  };

  const toggleReveal = async (key: string) => {
    if (!onReveal) return;
    if (revealed[key] !== undefined) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setRevealingKey(key);
    const value = await onReveal(key);
    if (value !== null) setRevealed((prev) => ({ ...prev, [key]: value }));
    setRevealingKey(null);
  };

  const copyValue = async (key: string) => {
    if (!onReveal) return;
    let value = revealed[key];
    if (value === undefined) {
      const result = await onReveal(key);
      if (result === null) return;
      value = result;
    }
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const confirmDelete = async (key: string | null = deleteKey) => {
    if (!key || !onRemove) return;
    await onRemove(key);
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDeleteKey(null);
  };

  const renderValueInput = (
    entry: EnvVarSlotEntry,
    value: string,
    onChange: (v: string) => void,
    onSubmit: () => void,
    onCancel?: () => void,
  ) =>
    entry.multiline ? (
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={entry.placeholder}
        className="h-20 font-mono text-xs"
        autoFocus={editingId === entry.id}
      />
    ) : (
      <Input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={entry.placeholder}
        className="h-7 font-mono text-xs"
        autoFocus={editingId === entry.id}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
          if (e.key === "Escape") onCancel?.();
        }}
      />
    );

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const matched = matchOf(entry);
        const configured = matched !== undefined;
        const isEditing = editingId === entry.id;
        const busy = savingId === entry.id;
        const Logo = entry.Logo;

        return (
          <div
            key={entry.id}
            className="rounded-surface border border-border px-3 py-2.5"
          >
            <div className="flex items-start gap-3">
              <Logo size={20} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{entry.label}</span>
                  {configured && (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <IconCheck size={10} /> Configured
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {entry.hint}
                </p>

                {!configured && !readOnly && (
                  <div className="mt-2 flex items-start gap-1.5">
                    <div className="flex-1">
                      {renderValueInput(
                        entry,
                        drafts[entry.id] ?? "",
                        (v) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [entry.id]: v,
                          })),
                        () => save(entry),
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => save(entry)}
                      disabled={!(drafts[entry.id] ?? "").trim() || busy}
                    >
                      Save
                    </Button>
                  </div>
                )}

                {configured && matched && isEditing && (
                  <div className="mt-2 flex items-start gap-1.5">
                    <div className="flex-1">
                      {renderValueInput(
                        entry,
                        editValue,
                        setEditValue,
                        () => saveEdit(entry, matched),
                        () => {
                          setEditingId(null);
                          setEditValue("");
                        },
                      )}
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="max-sm:hit-target text-primary hover:text-primary"
                      onClick={() => saveEdit(entry, matched)}
                      disabled={!editValue.trim() || busy}
                      title="Save"
                      aria-label="Save value"
                    >
                      <IconCheck size={14} />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="max-sm:hit-target"
                      onClick={() => {
                        setEditingId(null);
                        setEditValue("");
                      }}
                      title="Cancel"
                    >
                      <IconX size={14} />
                    </Button>
                  </div>
                )}

                {configured && matched && !isEditing && (
                  <div className="mt-1.5">
                    {revealed[matched.key] !== undefined && (
                      <pre className="mb-1 max-h-24 overflow-auto scroll-fade rounded-control border border-border bg-background px-2 py-1 font-mono text-xs break-all whitespace-pre-wrap">
                        {revealed[matched.key]}
                      </pre>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">
                      {matched.key}
                    </span>
                  </div>
                )}
              </div>

              {configured && matched && !isEditing && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="max-sm:hit-target"
                    onClick={() => toggleReveal(matched.key)}
                    disabled={revealingKey === matched.key}
                    title={
                      revealed[matched.key] !== undefined
                        ? "Hide value"
                        : "Reveal value"
                    }
                  >
                    <CrossfadeIcon
                      show={revealed[matched.key] !== undefined}
                      trueKey="hide"
                      falseKey="reveal"
                      className="relative flex size-3.5 items-center justify-center"
                      whenTrue={<IconEyeOff size={14} />}
                      whenFalse={<IconEye size={14} />}
                    />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="max-sm:hit-target"
                    onClick={() => copyValue(matched.key)}
                    title={copiedKey === matched.key ? "Copied!" : "Copy value"}
                  >
                    <CrossfadeIcon
                      show={copiedKey === matched.key}
                      trueKey="copied"
                      falseKey="copy"
                      className="relative flex size-3.5 items-center justify-center"
                      whenTrue={
                        <IconCheck size={14} className="text-primary" />
                      }
                      whenFalse={<IconCopy size={14} />}
                    />
                  </Button>
                  {!readOnly && (
                    <>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="max-sm:hit-target"
                        onClick={() => {
                          setEditingId(entry.id);
                          setEditValue("");
                        }}
                        title="Replace value"
                      >
                        <IconPencil size={14} />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title={skipConfirmTitle("Remove")}
                        onClick={(event) =>
                          requestConfirm(
                            altHeld,
                            () => setDeleteKey(matched.key),
                            () => {
                              void confirmDelete(matched.key);
                            },
                            event,
                          )
                        }
                        className="max-sm:hit-target text-destructive hover:text-destructive"
                      >
                        <IconTrash size={14} />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <Dialog
        open={deleteKey !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Variable</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove{" "}
            <span className="font-mono font-medium text-foreground">
              {deleteKey}
            </span>
            ? {removeDialogDescription}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteKey(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => void confirmDelete()}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
