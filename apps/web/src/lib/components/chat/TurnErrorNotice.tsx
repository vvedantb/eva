import { Button } from "@eva/ui";
import { IconAlertTriangle } from "@tabler/icons-react";

interface TurnErrorNoticeProps {
  /** What went wrong, in Eva's words: "Claude usage limit reached". */
  title: string;
  /** The provider's own text, kept verbatim under the title. */
  detail?: string;
  /**
   * Way out of the failure, on the row itself (usually Retry). Omitted when the
   * chat is read-only or there is nothing to re-send.
   */
  action?: { label: string; onClick: () => void };
}

/**
 * A turn that failed, rendered as a failure rather than as a reply. The same
 * text as markdown body copy reads like Eva answering with the word "Error" in
 * it; the tone step and the icon say the turn did not run at all.
 */
export function TurnErrorNotice({
  title,
  detail,
  action,
}: TurnErrorNoticeProps) {
  return (
    <div className="flex items-start gap-2 rounded-surface bg-destructive/10 px-3 py-2.5">
      <IconAlertTriangle
        size={16}
        className="mt-0.5 shrink-0 text-destructive"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {detail ? (
          <p className="text-xs text-muted-foreground wrap-anywhere">
            {detail}
          </p>
        ) : null}
      </div>
      {action ? (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
