"use client";

import { useState } from "react";
import {
  Button,
  CrossfadeIcon,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@eva/ui";
import {
  IconCheck,
  IconClipboard,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconKey,
  IconLock,
  IconLockOpen,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsEmptyState } from "@/lib/components/settings/SettingsEmptyState";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { EnvVarProviderSlots } from "@/lib/components/EnvVarProviderSlots";
import { parseEnvVars } from "./_utils/parseEnvVars";
import {
  KNOWN_ENV_VARS,
  INFRA_ENV_VARS,
  CONVEX_ENV_VARS,
  SLOT_ENV_VAR_KEYS,
  filterSlotsForScope,
  type EnvVarScope,
} from "./_utils/knownEnvVars";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";
import { requestConfirm, skipConfirmTitle, useAltHeld } from "@/lib/confirm";

export interface EnvVar {
  key: string;
  value: string;
  sandboxExclude: boolean;
}

interface EnvVarsTableProps {
  vars: EnvVar[] | undefined;
  onUpsert?: (
    key: string,
    value: string,
    sandboxExclude: boolean,
  ) => Promise<void>;
  onReveal?: (key: string) => Promise<string | null>;
  onRemove?: (key: string) => Promise<void>;
  onToggleSandboxExclude?: (
    key: string,
    sandboxExclude: boolean,
  ) => Promise<void>;
  description: string;
  /** Repo tab shows VERCEL_PROJECT_ID; team tab omits repo-only infra slots. */
  scope?: EnvVarScope;
  readOnly?: boolean;
}

export function EnvVarsTable({
  vars,
  onUpsert,
  onReveal,
  onRemove,
  onToggleSandboxExclude,
  description,
  scope = "repo",
  readOnly = false,
}: EnvVarsTableProps) {
  const [adding, setAdding] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [valueInput, setValueInput] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const altHeld = useAltHeld();

  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {},
  );
  const [revealingKey, setRevealingKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const startAdd = () => {
    setAdding(true);
    setKeyInput("");
    setValueInput("");
  };

  const cancelAdd = () => {
    setAdding(false);
    setKeyInput("");
    setValueInput("");
  };

  const handleAdd = async () => {
    if (!keyInput.trim() || !valueInput.trim() || !onUpsert) return;
    setSaving(true);
    try {
      await withMutationToast(
        onUpsert(keyInput.trim(), valueInput, false),
        "Variable added",
        "Couldn't add variable",
        "env-var-add",
      );
      setAdding(false);
      setKeyInput("");
      setValueInput("");
    } catch {
      // Toast already shown.
    }
    setSaving(false);
  };

  const startEdit = (key: string) => {
    setEditingKey(key);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue("");
  };

  const saveEdit = async () => {
    if (!editingKey || !editValue.trim() || !onUpsert) return;
    const existing = vars?.find((v) => v.key === editingKey);
    // Read out here: optional chaining and `??` inside the `try` bail the React
    // Compiler out of this whole file. See CLAUDE.md.
    const sandboxExclude = existing?.sandboxExclude ?? false;
    setSaving(true);
    try {
      await withMutationToast(
        onUpsert(editingKey, editValue, sandboxExclude),
        "Variable saved",
        "Couldn't save variable",
        "env-var-save",
      );
      setEditingKey(null);
      setEditValue("");
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[editingKey];
        return next;
      });
    } catch {
      // Toast already shown.
    }
    setSaving(false);
  };

  const confirmDelete = async (key: string | null = deleteKey) => {
    if (!key || !onRemove) return;
    try {
      await withMutationToast(
        onRemove(key),
        "Variable deleted",
        "Couldn't delete variable",
        "env-var-delete",
      );
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setDeleteKey(null);
    } catch {
      // Toast already shown.
    }
  };

  const toggleReveal = async (key: string) => {
    if (!onReveal) return;
    if (revealedValues[key] !== undefined) {
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setRevealingKey(key);
    const value = await onReveal(key);
    if (value !== null) {
      setRevealedValues((prev) => ({ ...prev, [key]: value }));
    }
    setRevealingKey(null);
  };

  const copyValue = async (key: string) => {
    if (!onReveal) return;
    let value = revealedValues[key];
    if (value === undefined) {
      const result = await onReveal(key);
      if (result === null) return;
      value = result;
    }
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleKeyInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text.includes("\n")) {
      e.preventDefault();
      setBulkText(text);
      setShowBulkPaste(true);
      cancelAdd();
    }
  };

  const handleBulkImport = async () => {
    if (!onUpsert) return;
    const parsed = parseEnvVars(bulkText);
    if (parsed.length === 0) return;
    setBulkSaving(true);
    // Built out here: a ternary inside the `try` bails the React Compiler out
    // of this whole file. See CLAUDE.md.
    const successMessage = `Imported ${parsed.length} variable${parsed.length !== 1 ? "s" : ""}`;
    try {
      await withMutationToast(
        Promise.all(
          parsed.map(({ key, value }) => onUpsert(key, value, false)),
        ),
        successMessage,
        "Couldn't import variables",
        "env-var-bulk-import",
      );
      setShowBulkPaste(false);
      setBulkText("");
    } catch {
      // Toast already shown.
    }
    setBulkSaving(false);
  };

  const parsedPreview = parseEnvVars(bulkText);
  const agentSlots = filterSlotsForScope(KNOWN_ENV_VARS, scope);
  const infraSlots = filterSlotsForScope(INFRA_ENV_VARS, scope);
  const convexSlots = filterSlotsForScope(CONVEX_ENV_VARS, scope);
  // Known slot keys are surfaced above — keep them out of the free-form table.
  const freeformVars = vars?.filter((v) => !SLOT_ENV_VAR_KEYS.has(v.key));
  const sandboxVars = (
    freeformVars?.filter((v) => !v.sandboxExclude) ?? []
  ).sort((a, b) => a.key.localeCompare(b.key));
  const excludedVars = (
    freeformVars?.filter((v) => v.sandboxExclude) ?? []
  ).sort((a, b) => a.key.localeCompare(b.key));
  const showTable = (freeformVars && freeformVars.length > 0) || adding;

  const renderRow = (v: EnvVar, index: number) => (
    <ListEnter
      key={v.key}
      as="tr"
      index={index}
      fast
      className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
    >
      <TableCell className="px-2.5 py-2.5 font-mono text-xs sm:px-4">
          {v.key}
        </TableCell>
        <TableCell className="px-2.5 py-2.5 sm:px-4">
          {editingKey === v.key ? (
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="Enter new value"
              className="h-7 font-mono text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") cancelEdit();
              }}
            />
          ) : (
            <span className="font-mono text-xs text-muted-foreground">
              {revealedValues[v.key] ?? v.value}
            </span>
          )}
        </TableCell>
        <TableCell className="px-2.5 py-2.5 text-right sm:px-4">
          {editingKey === v.key ? (
            <div className="flex items-center justify-end gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={saveEdit}
                disabled={!editValue.trim() || saving}
                title="Save"
                className="max-sm:hit-target text-primary hover:text-primary"
              >
                <IconCheck size={14} />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={cancelEdit}
                title="Cancel"
                className="max-sm:hit-target"
              >
                <IconX size={14} />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                className="hit-target"
                onClick={() => toggleReveal(v.key)}
                disabled={revealingKey === v.key}
                title={
                  revealedValues[v.key] !== undefined
                    ? "Hide value"
                    : "Reveal value"
                }
              >
                <CrossfadeIcon
                  show={revealedValues[v.key] !== undefined}
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
                className="hit-target"
                onClick={() => copyValue(v.key)}
                title={copiedKey === v.key ? "Copied!" : "Copy value"}
              >
                <CrossfadeIcon
                  show={copiedKey === v.key}
                  trueKey="copied"
                  falseKey="copy"
                  className="relative flex size-3.5 items-center justify-center"
                  whenTrue={<IconCheck size={14} className="text-primary" />}
                  whenFalse={<IconCopy size={14} />}
                />
              </Button>
              {!readOnly && (
                <>
                  {onToggleSandboxExclude && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="max-sm:hit-target"
                      onClick={() =>
                        void catchMutationError(
                          onToggleSandboxExclude(v.key, !v.sandboxExclude),
                          "Couldn't update sandbox setting",
                          "env-var-sandbox-exclude",
                        )
                      }
                      title={
                        v.sandboxExclude
                          ? "Excluded from sandbox (click to include)"
                          : "Included in sandbox (click to exclude)"
                      }
                    >
                      {v.sandboxExclude ? (
                        <IconLock size={14} className="text-warning" />
                      ) : (
                        <IconLockOpen size={14} />
                      )}
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => startEdit(v.key)}
                    title="Edit"
                    className="max-sm:hit-target"
                  >
                    <IconPencil size={14} />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={(event) =>
                      requestConfirm(
                        altHeld,
                        () => setDeleteKey(v.key),
                        () => {
                          void confirmDelete(v.key);
                        },
                        event,
                      )
                    }
                    title={skipConfirmTitle("Delete")}
                    className="max-sm:hit-target text-destructive hover:text-destructive"
                  >
                    <IconTrash size={14} />
                  </Button>
                </>
              )}
            </div>
          )}
        </TableCell>
    </ListEnter>
  );

  const tableHeader = (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead className="px-2.5 sm:px-4">Key</TableHead>
        <TableHead className="px-2.5 sm:px-4">Value</TableHead>
        <TableHead className="px-2.5 text-right sm:px-4">Actions</TableHead>
      </TableRow>
    </TableHeader>
  );

  const addingRow = adding ? (
    <TableRow>
      <TableCell className="px-2.5 py-2.5 sm:px-4">
        <Input
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onPaste={handleKeyInputPaste}
          placeholder="e.g. API_KEY"
          className="h-7 font-mono text-xs"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") cancelAdd();
          }}
        />
      </TableCell>
      <TableCell className="px-2.5 py-2.5 sm:px-4">
        <Input
          value={valueInput}
          onChange={(e) => setValueInput(e.target.value)}
          placeholder="Enter value"
          className="h-7 font-mono text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
            if (e.key === "Escape") cancelAdd();
          }}
        />
      </TableCell>
      <TableCell className="px-2.5 py-2.5 text-right sm:px-4">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={handleAdd}
            disabled={!keyInput.trim() || !valueInput.trim() || saving}
            title="Save"
            className="max-sm:hit-target text-primary hover:text-primary"
          >
            <IconCheck size={14} />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={cancelAdd}
            title="Cancel"
            className="max-sm:hit-target"
          >
            <IconX size={14} />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  ) : null;

  /** Add and bulk-paste both create free-form vars, so they sit on that card. */
  const freeformActions = readOnly ? undefined : (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setShowBulkPaste(true)}
      >
        <IconClipboard size={14} />
        Paste
      </Button>
      <Button size="sm" onClick={startAdd} disabled={adding}>
        <IconPlus size={14} />
        Add Variable
      </Button>
    </div>
  );

  return (
    <div className="space-y-8">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
      {vars !== undefined && (
        <>
          <SettingsSection title="Coding agents">
            <EnvVarProviderSlots
              entries={agentSlots}
              vars={vars}
              onUpsert={onUpsert}
              onReveal={onReveal}
              onRemove={onRemove}
              readOnly={readOnly}
            />
          </SettingsSection>
          <SettingsSection title="Infrastructure">
            <EnvVarProviderSlots
              entries={infraSlots}
              defaultSandboxExclude
              vars={vars}
              onUpsert={onUpsert}
              onReveal={onReveal}
              onRemove={onRemove}
              readOnly={readOnly}
              removeDialogDescription="Sandbox provisioning may fail until you paste it again."
            />
          </SettingsSection>
          <SettingsSection title="Convex">
            <EnvVarProviderSlots
              entries={convexSlots}
              vars={vars}
              onUpsert={onUpsert}
              onReveal={onReveal}
              onRemove={onRemove}
              readOnly={readOnly}
              removeDialogDescription="The sandboxed app may lose access to its Convex backend until you paste it again."
            />
          </SettingsSection>
        </>
      )}
      {vars === undefined ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* The table owns the card's full width, so the body carries no padding. */}
          <SettingsSection
            title="Other variables"
            description="Anything not covered by a known slot above."
            action={freeformActions}
            bodyVariant="list"
          >
            {showTable ? (
              <div className="overflow-x-auto">
                <Table className="min-w-[360px]">
                  {tableHeader}
                  <TableBody>
                    {addingRow}
                    {sandboxVars.map(renderRow)}
                    {sandboxVars.length === 0 && !adding && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={3}
                          className="px-4 py-6 text-center text-xs text-muted-foreground"
                        >
                          No sandbox variables
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <SettingsEmptyState
                icon={IconKey}
                title="No other variables"
                description="Add one to inject it into every sandbox for this scope."
              />
            )}
          </SettingsSection>

          {excludedVars.length > 0 && (
            <SettingsSection
              title={
                <span className="flex items-center gap-1.5">
                  <IconLock size={14} className="text-warning" />
                  Excluded from Sandbox
                </span>
              }
              description="Held for the platform only — these are never injected into a sandbox."
              bodyVariant="list"
            >
              <div className="overflow-x-auto">
                <Table className="min-w-[360px]">
                  {tableHeader}
                  <TableBody>{excludedVars.map(renderRow)}</TableBody>
                </Table>
              </div>
            </SettingsSection>
          )}
        </>
      )}

      <Dialog
        open={showBulkPaste}
        onOpenChange={(open) => {
          if (!open) {
            setShowBulkPaste(false);
            setBulkText("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Paste Environment Variables</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Paste your variables in{" "}
              <span className="font-mono">KEY=VALUE</span> format, one per line.
              Lines starting with <span className="font-mono">#</span> are
              ignored.
            </p>
            <Textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"API_KEY=abc123\nDATABASE_URL=postgres://..."}
              className="h-40 font-mono text-xs"
              autoFocus
            />
            {parsedPreview.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {parsedPreview.length} variable
                {parsedPreview.length !== 1 ? "s" : ""} detected
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowBulkPaste(false);
                setBulkText("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleBulkImport}
              disabled={parsedPreview.length === 0 || bulkSaving}
            >
              {bulkSaving && <Spinner size="sm" className="mr-1.5" />}
              Import{" "}
              {parsedPreview.length > 0
                ? `${parsedPreview.length} Variable${parsedPreview.length !== 1 ? "s" : ""}`
                : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteKey !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Variable</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-mono font-medium text-foreground">
              {deleteKey}
            </span>
            ? This cannot be undone.
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
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
