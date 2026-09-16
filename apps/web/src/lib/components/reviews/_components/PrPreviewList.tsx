import { CrossfadeIconSlot } from "@eva/ui";
import { IconArrowUpRight } from "@tabler/icons-react";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { ToneIcon, type PrOverview, type StatusTone } from "./prOverviewMeta";

type PrPreview = PrOverview["previews"][number];

/**
 * Deployment states as GitHub reports them, mapped onto the four tones the rest
 * of the surface already uses. `error` and `failure` are the same news told by
 * two providers, and `queued` and `in_progress` are both "not yet".
 */
function previewTone(state: string): StatusTone {
  if (state === "success") return "success";
  if (state === "failure" || state === "error") return "failure";
  if (state === "queued" || state === "in_progress" || state === "pending") {
    return "pending";
  }
  return "neutral";
}

/**
 * Where to go and look at the change running. A reviewer reading a UI diff wants
 * the deployed page more than they want the patch, and until now the only route
 * to it was scrolling the conversation for whatever comment the provider's bot
 * left.
 *
 * The host is the label, not the environment name: every deployment of a repo
 * shares the environment ("Preview"), and the hostname is the part that says which
 * branch and which app. Truncated from the left would be better still, but a
 * middle-truncated URL is harder to recognise than a clipped one.
 */
export function PrPreviewList({ previews }: { previews: PrPreview[] }) {
  return (
    <ul className="space-y-1.5">
      {previews.map((preview, index) => (
        <ListEnter
          key={`${preview.environment}-${preview.updatedAt}`}
          as="li"
          index={index}
          fast
          slide={false}
          className="min-w-0"
        >
          <PreviewRow preview={preview} />
        </ListEnter>
      ))}
    </ul>
  );
}

function PreviewRow({ preview }: { preview: PrPreview }) {
  const label = previewLabel(preview);

  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <CrossfadeIconSlot
          iconKey={previewTone(preview.state)}
          className="relative flex size-3.5 shrink-0 items-center justify-center"
        >
          <ToneIcon tone={previewTone(preview.state)} size={13} />
        </CrossfadeIconSlot>
        <span className="min-w-0 truncate text-xs">{label}</span>
        {preview.url === null ? null : (
          <IconArrowUpRight
            size={13}
            className="ml-auto shrink-0 text-muted-foreground"
            aria-hidden
          />
        )}
      </span>
      <span className="block pl-[calc(13px+0.375rem)] text-xs text-muted-foreground">
        <RelativeDateTime at={new Date(preview.updatedAt).getTime()} />
        {" ago"}
      </span>
    </>
  );

  if (preview.url === null) {
    return <span className="block">{body}</span>;
  }
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      title={preview.url}
      className="block hover:text-foreground"
    >
      {body}
    </a>
  );
}

/**
 * The hostname where there is one, the environment name where there is not.
 * `URL` throws on anything that is not absolute, and providers do occasionally
 * report a bare path, so the fall-back is the raw string rather than a crash.
 */
function previewLabel(preview: PrPreview): string {
  if (preview.url === null) return preview.environment;
  try {
    return new URL(preview.url).hostname;
  } catch {
    return preview.url;
  }
}
