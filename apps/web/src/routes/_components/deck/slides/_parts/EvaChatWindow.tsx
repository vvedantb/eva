import { IconArrowUp, IconChevronDown } from "@tabler/icons-react";
import { Message, MessageContent, ProviderIcon } from "@eva/ui";
import { Reveal } from "../../_components/DeckPrimitives";

/** What the one person types. Short enough to sit on a single line. */
const MESSAGES: readonly string[] = [
  "Ship the referral export fix",
  "Review overnight bug reports",
  "Draft the September changelog",
];

/**
 * The composer bottom row: the app's compact prompt pill plus the muted bar
 * that carries the model picker. Static copies of `ChatComposer`'s markup —
 * the real components need a Convex repo, a draft and a submit handler.
 */
function EvaComposer() {
  return (
    <div className="p-3">
      <div className="border-input flex h-12 items-center rounded-full border bg-card py-1 pr-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
          Ask Eva to build something...
        </span>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <IconArrowUp className="size-4" />
        </span>
      </div>
      <div className="mx-auto flex w-[calc(100%-1.5rem)] items-center gap-0.5 rounded-b-surface bg-muted/70 px-2 py-0.5">
        <div className="ml-auto flex h-7 items-center gap-1.5 px-2 text-xs text-muted-foreground">
          <ProviderIcon provider="claude" size={14} />
          <span>Fable 5.1</span>
          <IconChevronDown className="size-3" />
        </div>
      </div>
    </div>
  );
}

/**
 * Eva's chat, drawn with the app's own message and composer styling: three
 * instructions typed by one person, then the prompt bar they typed them into.
 */
export function EvaChatWindow() {
  return (
    <div className="dark w-[340px] overflow-hidden rounded-2xl bg-background ring-1 ring-white/10">
      <div className="flex flex-col gap-3 px-4 pt-4">
        {MESSAGES.map((message, index) => (
          <Reveal key={message} delay={0.3 + index * 0.45} from="left">
            <Message from="user">
              <MessageContent className="rounded-surface bg-primary/10 px-3 py-2 text-foreground group-[.is-user]:bg-primary/10">
                {message}
              </MessageContent>
            </Message>
          </Reveal>
        ))}
      </div>
      <EvaComposer />
    </div>
  );
}
