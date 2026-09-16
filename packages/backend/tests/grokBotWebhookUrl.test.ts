import { describe, expect, it } from "vitest";
import {
  normalizeGrokBotWebhookKey,
  parseGrokBotWebhookUrl,
} from "../convex/_grokBot/webhookUrl";

const VALID =
  "https://api2.cursor.sh/automations/webhook/6076a0ff-5b26-405e-82ef-d6173cd96066";

describe("parseGrokBotWebhookUrl", () => {
  it("accepts a Cursor routine URL and trims it", () => {
    expect(parseGrokBotWebhookUrl(`  ${VALID}  `)).toBe(VALID);
  });

  it("rejects anything that is not that host and path", () => {
    expect(parseGrokBotWebhookUrl("http://api2.cursor.sh/automations/webhook/abc12345")).toBe(
      null,
    );
    expect(
      parseGrokBotWebhookUrl("https://evil.example/automations/webhook/abc12345"),
    ).toBe(null);
    expect(parseGrokBotWebhookUrl("https://api2.cursor.sh/automations/webhook/abc12345?x=1")).toBe(
      null,
    );
    expect(
      parseGrokBotWebhookUrl("https://user:pass@api2.cursor.sh/automations/webhook/abc12345"),
    ).toBe(null);
    expect(parseGrokBotWebhookUrl("https://api2.cursor.sh/automations/webhook/../secret")).toBe(
      null,
    );
    expect(parseGrokBotWebhookUrl("not a url")).toBe(null);
  });
});

describe("normalizeGrokBotWebhookKey", () => {
  it("accepts a raw key and strips a Bearer prefix", () => {
    expect(normalizeGrokBotWebhookKey("crsr_abcdefghijklmnopqrstuv")).toBe(
      "crsr_abcdefghijklmnopqrstuv",
    );
    expect(normalizeGrokBotWebhookKey("Bearer crsr_abcdefghijklmnopqrstuv")).toBe(
      "crsr_abcdefghijklmnopqrstuv",
    );
  });

  it("rejects empty, short, or spaced values", () => {
    expect(normalizeGrokBotWebhookKey("")).toBe(null);
    expect(normalizeGrokBotWebhookKey("short")).toBe(null);
    expect(normalizeGrokBotWebhookKey("crsr_ abc def ghi jkl")).toBe(null);
  });
});
