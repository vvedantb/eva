"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { Button, CrossfadeIcon, Switch } from "@vvedantb/ui";
import { IconCheck, IconCopy, IconEye, IconEyeOff } from "@tabler/icons-react";

/**
 * Reveal, copy and "show values" for env vars and API keys, after AI Elements'
 * EnvironmentVariables. Values stay masked by the server; a plain value
 * reaches the client only when the user reveals or copies it.
 */

type RevealValue = (key: string) => Promise<string | null>;

export interface EnvironmentVariablesStore {
  /** Plain values the user revealed, by key. */
  revealed: Readonly<Record<string, string>>;
  /** Keys with a reveal call in flight. */
  pending: ReadonlyArray<string>;
  copiedKey: string | null;
  canReveal: boolean;
  toggle: (key: string) => Promise<void>;
  showValues: (keys: ReadonlyArray<string>, show: boolean) => Promise<void>;
  copy: (key: string) => Promise<void>;
  /** Drops a revealed value, after the var is edited or deleted. */
  forget: (key: string) => void;
}

const COPIED_MS = 1500;

export function useEnvironmentVariables(
  onReveal: RevealValue | undefined,
): EnvironmentVariablesStore {
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const forget = (key: string) =>
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const reveal = async (keys: ReadonlyArray<string>) => {
    if (!onReveal || keys.length === 0) return;
    setPending((prev) => [...prev, ...keys]);
    const values = await Promise.all(keys.map((key) => onReveal(key)));
    setRevealed((prev) => {
      const next = { ...prev };
      keys.forEach((key, index) => {
        const value = values[index];
        if (value !== null) next[key] = value;
      });
      return next;
    });
    setPending((prev) => prev.filter((key) => !keys.includes(key)));
  };

  const toggle = async (key: string) => {
    if (revealed[key] !== undefined) {
      forget(key);
      return;
    }
    await reveal([key]);
  };

  const showValues = async (keys: ReadonlyArray<string>, show: boolean) => {
    if (!show) {
      setRevealed({});
      return;
    }
    await reveal(keys.filter((key) => revealed[key] === undefined));
  };

  const copy = async (key: string) => {
    if (!onReveal) return;
    const value = revealed[key] ?? (await onReveal(key));
    if (value === null) return;
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), COPIED_MS);
  };

  return {
    revealed,
    pending,
    copiedKey,
    canReveal: onReveal !== undefined,
    toggle,
    showValues,
    copy,
    forget,
  };
}

const EnvironmentVariablesContext =
  createContext<EnvironmentVariablesStore | null>(null);

export function EnvironmentVariables({
  value,
  children,
}: {
  value: EnvironmentVariablesStore;
  children: ReactNode;
}) {
  return (
    <EnvironmentVariablesContext value={value}>
      {children}
    </EnvironmentVariablesContext>
  );
}

export function useEnvironmentVariablesContext(): EnvironmentVariablesStore {
  const store = use(EnvironmentVariablesContext);
  if (store === null) {
    throw new Error(
      "Environment variable controls must sit inside <EnvironmentVariables>.",
    );
  }
  return store;
}

/** One switch that reveals or hides every value in `keys`. */
export function EnvironmentVariablesToggle({
  keys,
}: {
  keys: ReadonlyArray<string>;
}) {
  const { revealed, pending, canReveal, showValues } =
    useEnvironmentVariablesContext();
  const checked =
    keys.length > 0 && keys.every((key) => revealed[key] !== undefined);
  return (
    // Not a <label>: it would re-dispatch the click to the switch and toggle
    // it twice.
    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
      Show values
      <Switch
        checked={checked}
        disabled={!canReveal || keys.length === 0 || pending.length > 0}
        onCheckedChange={(show) => void showValues(keys, show)}
        aria-label="Show values"
      />
    </div>
  );
}

/** The revealed value, or the server's masked value until then. */
export function EnvironmentVariableValue({
  name,
  masked,
}: {
  name: string;
  masked: string;
}) {
  const { revealed } = useEnvironmentVariablesContext();
  return (
    <span className="font-mono text-xs break-all text-muted-foreground">
      {revealed[name] ?? masked}
    </span>
  );
}

export function EnvironmentVariableRevealButton({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const { revealed, pending, toggle } = useEnvironmentVariablesContext();
  const shown = revealed[name] !== undefined;
  return (
    <Button
      shape="rounded"
      size="icon-sm"
      variant="ghost"
      className={className}
      onClick={() => void toggle(name)}
      disabled={pending.includes(name)}
      title={shown ? "Hide value" : "Reveal value"}
    >
      <CrossfadeIcon
        show={shown}
        trueKey="hide"
        falseKey="reveal"
        className="relative flex size-3.5 items-center justify-center"
        whenTrue={<IconEyeOff size={14} />}
        whenFalse={<IconEye size={14} />}
      />
    </Button>
  );
}

export function EnvironmentVariableCopyButton({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const { copiedKey, copy } = useEnvironmentVariablesContext();
  const copied = copiedKey === name;
  return (
    <Button
      shape="rounded"
      size="icon-sm"
      variant="ghost"
      className={className}
      onClick={() => void copy(name)}
      title={copied ? "Copied!" : "Copy value"}
    >
      <CrossfadeIcon
        show={copied}
        trueKey="copied"
        falseKey="copy"
        className="relative flex size-3.5 items-center justify-center"
        whenTrue={<IconCheck size={14} className="text-primary" />}
        whenFalse={<IconCopy size={14} />}
      />
    </Button>
  );
}
