"use client";

import { Button, CrossfadeIcon, CircleSpinner, cn } from "@eva/ui";
import { IconArrowUp } from "@tabler/icons-react";

interface CommentSendButtonProps {
  onClick: () => void;
  disabled: boolean;
  isSubmitting: boolean;
  size?: "icon-xs" | "icon-sm";
  /** `outline` for the quiet inline reply row; `default` for full composers. */
  variant?: "default" | "outline";
  className?: string;
  ariaLabel?: string;
  /**
   * Quiet idle state: with nothing to send the button is a bare muted arrow and
   * only fills with the accent once the field has content, so an empty composer
   * carries no solid blob in its corner.
   */
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
        "rounded-full transition-colors",
        // Button fades disabled controls to 45%, which leaves the idle arrow
        // barely visible on the card: hold it at a readable muted tone instead.
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
        whenTrue={<CircleSpinner size="sm" />}
        whenFalse={<IconArrowUp size={16} />}
      />
    </Button>
  );
}
