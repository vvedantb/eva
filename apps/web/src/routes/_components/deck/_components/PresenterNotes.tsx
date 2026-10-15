import { BRAND } from "./DeckPrimitives";

const ARROW = "→ ";

/**
 * Speaker notes as plain readable prose. Lines starting with an arrow become
 * their own indented row — enough structure for a script without dragging a
 * markdown renderer into the deck.
 */
export function PresenterNotes({ notes }: { notes: string }) {
  if (notes.trim().length === 0) {
    return <p className="text-lg text-white/35">No notes for this slide.</p>;
  }

  return (
    <div className="space-y-2 text-lg leading-relaxed whitespace-pre-line text-pretty text-white/85">
      {notes.split("\n").map((line, index) => {
        const id = `${index}-${line}`;

        if (line.trim().length === 0) return <div key={id} className="h-3" />;

        if (line.startsWith(ARROW)) {
          return (
            <p key={id} className="flex gap-3 pl-5">
              <span aria-hidden style={{ color: BRAND.purple }}>
                →
              </span>
              <span>{line.slice(ARROW.length)}</span>
            </p>
          );
        }

        return <p key={id}>{line}</p>;
      })}
    </div>
  );
}

interface NextUpProps {
  title: string | undefined;
  number: number;
}

/** What comes after the current slide, so the handover is never a surprise. */
export function PresenterNextUp({ title, number }: NextUpProps) {
  return (
    <div className="mt-10 border-t border-white/10 pt-5">
      <div className="text-[11px] font-medium tracking-[0.22em] text-white/35 uppercase">
        Next up
      </div>
      {title === undefined ? (
        <div className="mt-2 text-base text-white/40">End of deck</div>
      ) : (
        <div className="mt-2 flex items-baseline gap-3">
          <span className="font-mono text-sm tabular-nums text-white/35">
            {String(number).padStart(2, "0")}
          </span>
          <span className="text-base text-white/70">{title}</span>
        </div>
      )}
    </div>
  );
}
