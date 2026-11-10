import { describe, expect, it } from "vitest";
import {
  acceptMentionTrigger,
  dataMentionItems,
  filterMentionItems,
  findMentionTrigger,
  peopleMentionItems,
  shouldShowMentionPicker,
  skillSlashItems,
  systemSkillTokenId,
  tokenizeMentionText,
  tokenizedToEditable,
} from "@eva/shared";
import type { Id } from "@eva/backend";
import { z } from "zod";

// The picker logic the web `MentionEditor` and the phone composer share.

const ADA = z.custom<Id<"users">>().parse("k17ada0000000000000000000000ad01");
const DOC = "k17doc000000000000000000000000d1";

describe("findMentionTrigger", () => {
  it("opens on an @ or / at the start or after whitespace, up to the end", () => {
    expect(findMentionTrigger("@ad", true, true)).toEqual({
      kind: "mention",
      query: "ad",
      startIndex: 0,
    });
    expect(findMentionTrigger("hi /rev", true, true)).toEqual({
      kind: "slash",
      query: "rev",
      startIndex: 3,
    });
  });

  it("stays closed inside a word, after a space, or for a kind with no list", () => {
    expect(findMentionTrigger("mail@ada", true, true)).toBeNull();
    expect(findMentionTrigger("src/app", true, true)).toBeNull();
    expect(findMentionTrigger("@ada lovelace", true, true)).toBeNull();
    expect(findMentionTrigger("@ad", false, true)).toBeNull();
  });

  it("takes the later trigger when both are typed", () => {
    expect(findMentionTrigger("/rev @a", true, true)?.kind).toBe("mention");
  });
});

describe("accepting a pick and sending it", () => {
  it("replaces the trigger with the chip and a space, then tokenizes to the web wire format", () => {
    const trigger = findMentionTrigger("ask @ad", true, true);
    if (!trigger) throw new Error("no trigger");
    const accepted = acceptMentionTrigger("ask @ad", trigger, "Ada Lovelace");
    expect(accepted).toEqual({
      value: "ask @Ada Lovelace ",
      inserted: { startIndex: 4, token: "@Ada Lovelace" },
    });
    const skillId = systemSkillTokenId("eva-capture");
    const wire = tokenizeMentionText(`${accepted.value}/eva-capture`, {
      mentionMap: new Map([["Ada Lovelace", ADA]]),
      skillMap: new Map([["eva-capture", skillId]]),
    });
    expect(wire).toBe(`ask @[Ada Lovelace](${ADA}) /[eva-capture](${skillId})`);
    // And back: what a restored stash or draft hands the editor.
    expect(tokenizedToEditable(wire)).toEqual({
      displayText: "ask @Ada Lovelace /eva-capture",
      mentionMap: new Map([["Ada Lovelace", ADA]]),
      skillMap: new Map([["eva-capture", skillId]]),
    });
  });
});

describe("picker lists", () => {
  it("filters by label or description, alphabetically, and shows No matches instead of closing", () => {
    const items = [
      { id: "b", label: "Billing", description: "invoice flow" },
      { id: "a", label: "Auth" },
    ];
    expect(filterMentionItems(items, "").map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
    expect(filterMentionItems(items, "INVOICE").map((item) => item.id)).toEqual(
      ["b"],
    );
    const trigger = { kind: "mention" as const, query: "zzz", startIndex: 0 };
    expect(
      shouldShowMentionPicker(trigger, {
        mentions: 2,
        skills: 0,
        hasEmptySkills: false,
      }),
    ).toBe(true);
    expect(
      shouldShowMentionPicker(
        { ...trigger, kind: "slash" },
        { mentions: 2, skills: 0, hasEmptySkills: false },
      ),
    ).toBe(false);
  });

  it("builds people, data and skill rows from the query results", () => {
    expect(
      peopleMentionItems([
        { _id: ADA, fullName: " Ada Lovelace " },
        { _id: ADA, email: "" },
      ]),
    ).toEqual([
      { id: ADA, label: "Ada Lovelace", badge: "Person", personUserId: ADA },
    ]);
    expect(
      dataMentionItems([
        { id: DOC, label: "Spec", badge: "Document", kind: "document" },
      ]),
    ).toEqual([
      { id: DOC, label: "Spec", badge: "Document", kind: "document" },
    ]);
    const skills = skillSlashItems(
      [],
      [
        { name: "eva-capture", description: "Capture", installed: true },
        { name: "eva-off", description: "Off", installed: false },
      ],
      "claude",
      [{ name: "loop", description: "Loop" }],
    );
    expect(skills.map((item) => [item.label, item.badge])).toEqual([
      ["eva-capture", "Eva"],
      ["loop", "Claude"],
    ]);
  });
});
