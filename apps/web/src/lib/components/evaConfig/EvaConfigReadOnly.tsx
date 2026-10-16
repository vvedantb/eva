"use client";

import type { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useRepo } from "@/lib/contexts/RepoContext";

type Repo = NonNullable<
  FunctionReturnType<typeof api.githubRepos.getByOwnerAndName>
>;

/** Present ⇒ the repo owns its commands via `.eva/config.json`. */
export type EvaConfig = NonNullable<Repo["evaConfig"]>;

/** Parse error of the repo's `.eva/` files. Multi-line, so kept verbatim. */
export function EvaConfigError({ error }: { error: string }) {
  return (
    <pre className="whitespace-pre-wrap wrap-break-word rounded-control bg-destructive/10 px-3 py-2 font-mono text-xs leading-relaxed text-destructive">
      {error}
    </pre>
  );
}

/**
 * "Managed by .eva/config.json on <ref>", linked to the file on GitHub, plus
 * the sync error when the current file does not parse.
 */
export function EvaConfigManagedNote({ evaConfig }: { evaConfig: EvaConfig }) {
  const { owner, name } = useRepo();
  const fileUrl = `https://github.com/${owner}/${name}/blob/${evaConfig.ref}/.eva/config.json`;

  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">
        Managed by{" "}
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-primary hover:underline"
        >
          .eva/config.json
        </a>{" "}
        on <code>{evaConfig.ref}</code>. Edit the file to change these.
      </p>
      {evaConfig.error ? <EvaConfigError error={evaConfig.error} /> : null}
    </div>
  );
}

/** Synced values (commands, a port), one per line, read-only. */
export function ReadOnlyLines({
  lines,
  emptyLabel = "None",
}: {
  lines: readonly string[] | undefined;
  emptyLabel?: string;
}) {
  if (lines === undefined || lines.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <pre className="whitespace-pre-wrap wrap-break-word rounded-control bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground/80">
      {lines.join("\n")}
    </pre>
  );
}
