"use client";

import {
  CommandItem,
  CommandShortcut,
  motionFast,
  motionStagger,
} from "@eva/ui";
import { m } from "motion/react";
import type { ReactNode } from "react";
import { MarqueeOnHover } from "@/lib/components/ui/MarqueeOnHover";
import type { SpotlightIcon } from "@/lib/components/_components/spotlightGroups";

interface SpotlightItemProps {
  /** cmdk's own value. Filtering is off, so it only has to be unique. */
  value: string;
  icon: SpotlightIcon;
  title: string;
  /** Right-hand hint: the app a hit belongs to, or an action's key cap. */
  trailing?: ReactNode;
  /** Position in its group, for the entrance stagger. */
  index: number;
  onSelect: () => void;
}

/** One spotlight row — a result, a recent, or an action. */
export function SpotlightItem({
  value,
  icon: Icon,
  title,
  trailing,
  index,
  onSelect,
}: SpotlightItemProps) {
  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        ...motionFast,
        delay: motionStagger(index, 0.02, 0.08),
      }}
    >
      <CommandItem value={value} onSelect={onSelect}>
        <Icon size={16} className="text-muted-foreground" />
        <MarqueeOnHover className="min-w-0 flex-1">{title}</MarqueeOnHover>
        {trailing === undefined ? null : (
          <CommandShortcut className="max-w-[40%] truncate normal-case tracking-normal">
            {trailing}
          </CommandShortcut>
        )}
      </CommandItem>
    </m.div>
  );
}
