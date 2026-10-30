import type { ReactNode } from "react";
import { DeckThemeContext } from "./deckContext";
import type { DeckTheme } from "./deckContext";

/**
 * Hands a slide its surface. On a light slide the wrapper also carries
 * `deck-ink-light`, which redefines Tailwind's `--color-white` as dark ink, so
 * every `text-white/70`, `bg-white/[0.05]` and `ring-white/10` a slide was
 * written with reads correctly on the light stage without a per-slide palette.
 * App windows inside a slide keep their `dark` class and get real white back.
 * `display: contents` leaves no box, so the 3D stage is untouched.
 */
export function DeckThemeScope({
  theme,
  children,
}: {
  theme: DeckTheme;
  children: ReactNode;
}) {
  return (
    <DeckThemeContext value={theme}>
      <div
        className={theme === "light" ? "deck-ink-light contents" : "contents"}
      >
        {children}
      </div>
    </DeckThemeContext>
  );
}
