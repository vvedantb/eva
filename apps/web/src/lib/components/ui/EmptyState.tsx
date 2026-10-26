"use client";

import { IconPlus } from "@tabler/icons-react";
import { cn } from "@eva/ui";
import { Button, motionEase } from "@vvedantb/ui";
import { m, type Variants } from "motion/react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: React.ReactNode;
  /**
   * Quiet stagger entrance for rare/first-time empties.
   * Pass `false` for filter "no results" flashes (tens/day).
   */
  animate?: boolean;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  action,
  animate = true,
  className,
}: EmptyStateProps) {
  const containerVariants: Variants = {
    hidden: {},
    show: {
      transition: { staggerChildren: 0.04 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.22, ease: motionEase },
    },
  };

  return (
    <m.div
      className={cn(
        "mx-auto flex w-full max-w-xl flex-col items-center justify-center px-4 py-16 text-center sm:py-20",
        className,
      )}
      variants={animate ? containerVariants : undefined}
      initial={animate ? "hidden" : false}
      animate={animate ? "show" : undefined}
    >
      {icon ? (
        <m.div
          variants={animate ? itemVariants : undefined}
          className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          {icon}
        </m.div>
      ) : null}
      <m.p
        variants={animate ? itemVariants : undefined}
        className="text-balance text-sm font-medium tracking-[-0.01em] text-foreground"
      >
        {title}
      </m.p>
      {description ? (
        <m.p
          variants={animate ? itemVariants : undefined}
          className="mt-2 max-w-sm text-pretty text-xs leading-relaxed text-muted-foreground"
        >
          {description}
        </m.p>
      ) : null}
      {actionLabel && onAction ? (
        <m.div variants={animate ? itemVariants : undefined}>
          <Button size="sm" onClick={onAction} className="mt-6">
            <IconPlus size={16} />
            {actionLabel}
          </Button>
        </m.div>
      ) : null}
      {action ? (
        <m.div variants={animate ? itemVariants : undefined}>{action}</m.div>
      ) : null}
    </m.div>
  );
}
