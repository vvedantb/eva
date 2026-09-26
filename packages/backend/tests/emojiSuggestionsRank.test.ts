import { describe, expect, it } from "vitest";
import {
  EMOJI_CANDIDATES,
  MAX_EMOJI_SUGGESTIONS,
  MIN_EMOJI_PROBABILITY,
  rankEmoji,
} from "../convex/_emojiSuggestions/rank";

describe("EMOJI_CANDIDATES", () => {
  it("fits Jev's 255-option cap with unique names and emoji", () => {
    expect(EMOJI_CANDIDATES.length).toBeLessThanOrEqual(255);
    const names = EMOJI_CANDIDATES.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    const emoji = EMOJI_CANDIDATES.map((c) => c.emoji);
    expect(new Set(emoji).size).toBe(emoji.length);
    expect(names.every((name) => name.length <= 128)).toBe(true);
  });
});

describe("rankEmoji", () => {
  it("maps names back to emoji, best first", () => {
    expect(
      rankEmoji({
        "fire, hot, lit, amazing": 0.2,
        "rocket, ship it, launch, fast": 0.5,
      }),
    ).toEqual(["🚀", "🔥"]);
  });

  it("drops invented options and the long tail", () => {
    expect(
      rankEmoji({
        "not a real option": 0.9,
        "rocket, ship it, launch, fast": MIN_EMOJI_PROBABILITY / 2,
        "  Fire, hot, lit, amazing ": 0.3,
      }),
    ).toEqual(["🔥"]);
  });

  it("caps the result", () => {
    const probabilities = Object.fromEntries(
      EMOJI_CANDIDATES.slice(0, 10).map((c) => [c.name, 0.1]),
    );
    expect(rankEmoji(probabilities)).toHaveLength(MAX_EMOJI_SUGGESTIONS);
  });
});
