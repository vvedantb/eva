"use client";

import { Button, CrossfadeIcon, cn } from "@eva/ui";
import { IconArrowUp, IconLoader2 } from "@tabler/icons-react";

interface CommentSendButtonProps {
  onClick: () => void;
  disabled: boolean;
  isSubmitting: boolean;
  size?: "icon-xs" | "icon-sm";
  /** `outline` for the quiet inline reply row; `default` for full composers. */
  variant?: "default" | "outline";
  className?: string;
  ariaLabel?: string;
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
}: CommentSendButtonProps) {
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn("rounded-full", className)}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <CrossfadeIcon
        show={isSubmitting}
        trueKey="loading"
        falseKey="send"
        className="relative flex size-4 items-center justify-center"
        whenTrue={<IconLoader2 size={16} className="animate-spin" />}
        whenFalse={<IconArrowUp size={16} />}
      />
    </Button>
  );
}
