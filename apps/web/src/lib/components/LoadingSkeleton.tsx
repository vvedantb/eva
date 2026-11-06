import type { ReactNode } from "react";
import { Skeleton } from "skullet/react";
import { CenteredSpinner } from "@vvedantb/ui";
import { z } from "zod";

// skullet keeps measured shapes in localStorage under this key (v2 format).
// If the format changes, the parse fails and we fall back to the spinner.
const storedShapes = z.object({
  v: z.literal(2),
  shapes: z.record(z.string()),
});

function hasRememberedShape(id: string): boolean {
  try {
    const parsed = storedShapes.safeParse(
      JSON.parse(localStorage.getItem("skullet:shapes") ?? "null"),
    );
    return parsed.success && id in parsed.data.shapes;
  } catch {
    return false;
  }
}

/**
 * Loading state for a Convex list query (`undefined` while loading).
 * - Revisit: skullet draws the list's remembered shape, so nothing moves on reveal.
 * - First visit (no shape yet): the usual centred spinner.
 * - Empty list: `empty` renders and no empty shape is saved for next time.
 */
export function LoadingSkeleton<TItem>({
  id,
  data,
  label,
  empty,
  spinnerClassName,
  children,
}: {
  /** Unique per list; keys the remembered shape. */
  id: string;
  data: TItem[] | undefined;
  label: string;
  empty: ReactNode;
  spinnerClassName?: string;
  children: (items: TItem[]) => ReactNode;
}) {
  const isEmpty = data !== undefined && data.length === 0;
  const fallback =
    data === undefined && !hasRememberedShape(id) ? (
      <CenteredSpinner label={label} className={spinnerClassName} />
    ) : undefined;

  return (
    <Skeleton
      id={id}
      data={data}
      label={label}
      skeleton={fallback}
      empty={isEmpty}
      emptyMessage={empty}
    >
      {children}
    </Skeleton>
  );
}
