"use client";

import { cn } from "@eva/ui";
import { Button, CrossfadeIcon, Spinner } from "@vvedantb/ui";
import { IconArrowUp } from "@tabler/icons-react";

interface CommentSendButtonProps {
  onClick: () => void;
  disabled: boolean;
  isSubmitting: boolean;
  size?: "icon-xs" | "icon-sm";
  variant?: "default" | "outline";
  className?: string;
  ariaLabel?: string;
  quietWhenDisabled?: boolean;
}

/**
 * Round send button shared by the comment composers. The arrow cross-fades to a
 * spinner while a submit is in flight so the action always has feedback.
 */
export function CommentSendButton({
  onClick,
  disabled,
  isSubmitting,
  size = "icon-xs",
  variant = "default",
  className,
  ariaLabel = "Send",
  quietWhenDisabled = false,
}: CommentSendButtonProps) {
  const isIdle = quietWhenDisabled && disabled && !isSubmitting;

  return (
    <Button
      type="button"
      size={size}
      variant={isIdle ? "ghost" : variant}
      className={cn(
        "transition-colors",
        isIdle && "text-muted-foreground/70 disabled:opacity-100",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <CrossfadeIcon
        show={isSubmitting}
        trueKey="loading"
        falseKey="send"
        className="relative flex size-4 items-center justify-center"
        whenTrue={<Spinner variant="circle" size="sm" />}
        whenFalse={<IconArrowUp size={16} />}
      />
    </Button>
  );
}
