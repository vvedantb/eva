import type { ReactNode } from "react";
import { cn } from "@eva/ui";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";
import { repoTileColor } from "@/lib/utils/repoTileColor";

/**
 * Renders a repo's uploaded logo image when present, otherwise the page's
 * existing fallback icon. Kept presentational so both the home and team repo
 * cards render the logo identically.
 */
export function RepoLogo({
  logoUrl,
  fallback,
  size = 28,
  className,
}: {
  logoUrl?: string | null;
  fallback: ReactNode;
  size?: number;
  className?: string;
}) {
  if (!logoUrl) return <>{fallback}</>;
  return (
    <img
      src={logoUrl}
      alt=""
      width={size}
      height={size}
      className={cn(
        "shrink-0 rounded-md border border-border object-cover",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}

/** The repo fields `RepoAppMark` reads: identity, custom label, logo. */
export interface RepoAppMarkRepo {
  owner: string;
  name: string;
  rootDirectory?: string;
  label?: string;
  logoUrl?: string | null;
}

/**
 * Small app mark: the uploaded logo, or the app's first letter on its tile
 * colour. Used where a row or chip must say which app it belongs to.
 */
export function RepoAppMark({
  repo,
  className,
}: {
  repo: RepoAppMarkRepo;
  className?: string;
}) {
  const label = repoDisplayLabel(repo);
  const tile = repoTileColor(`${repo.owner}/${repo.name}/${label}`);
  return (
    <RepoLogo
      logoUrl={repo.logoUrl}
      size={14}
      className={className}
      fallback={
        <span
          className={cn(
            "flex size-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold",
            tile.bg,
            tile.text,
            className,
          )}
        >
          {label.charAt(0).toUpperCase()}
        </span>
      }
    />
  );
}
