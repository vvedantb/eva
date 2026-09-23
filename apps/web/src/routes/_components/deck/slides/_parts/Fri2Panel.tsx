import type { ReactNode } from "react";
import { cn } from "@eva/ui";

interface Fri2PanelProps {
  children: ReactNode;
  /** Optional chrome row above the screen, for a title or a set of tabs. */
  header?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/**
 * The app-window frame the Friday slides draw their mocks inside: a 20px outer
 * shell with 4px of padding, so the 16px inner screen stays concentric with it.
 * Radii are written in pixels rather than `rounded-2xl` because the pair has to
 * agree exactly — the app's `--radius` makes the named scale hard to reason
 * about once one of the two is nested.
 */
export function Fri2Panel({
  children,
  header,
  className,
  bodyClassName,
}: Fri2PanelProps) {
  return (
    <div
      className={cn(
        "rounded-[20px] bg-white/[0.05] p-1 ring-1 ring-white/10",
        className,
      )}
    >
      {header ? (
        <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-white/45">
          {header}
        </div>
      ) : null}
      <div
        className={cn(
          "rounded-[16px] bg-[#0b0c11] p-5 ring-1 ring-white/[0.06]",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
