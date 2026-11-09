import { describe, expect, test } from "vitest";
import { escapeHtml } from "@eva/shared/escapeHtml";
import { isHttpUrl, isInternalAppHref } from "@eva/shared/safeUrl";
import { buildNotificationDigestHtml } from "../convex/emailTemplates";

describe("isHttpUrl", () => {
  test("accepts http(s) and relative links", () => {
    expect(isHttpUrl("https://example.com/a")).toBe(true);
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("/owner/repo")).toBe(true);
  });

  test("rejects script and data schemes, however they are disguised", () => {
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("JaVaScRiPt:alert(1)")).toBe(false);
    expect(isHttpUrl(" javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("java\tscript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:text/html,<script>1</script>")).toBe(false);
    expect(isHttpUrl("vbscript:msgbox(1)")).toBe(false);
  });
});

describe("isInternalAppHref", () => {
  test("accepts app paths, with query and hash", () => {
    expect(isInternalAppHref("/inbox")).toBe(true);
    expect(isInternalAppHref("/o/r/quick-tasks/3?comment=abc#top")).toBe(true);
    expect(isInternalAppHref("/o/r?next=https://x.dev")).toBe(true);
  });

  test("rejects anything that can leave the app", () => {
    expect(isInternalAppHref("https://evil.example")).toBe(false);
    expect(isInternalAppHref("javascript:alert(1)")).toBe(false);
    expect(isInternalAppHref("//evil.example")).toBe(false);
    expect(isInternalAppHref("/\\evil.example")).toBe(false);
    expect(isInternalAppHref("/\t/evil.example")).toBe(false);
    expect(isInternalAppHref("/\n/evil.example")).toBe(false);
    expect(isInternalAppHref("/a\u0000b")).toBe(false);
    expect(isInternalAppHref("/a\u007fb")).toBe(false);
    expect(isInternalAppHref("relative/path")).toBe(false);
    expect(isInternalAppHref("")).toBe(false);
  });
});

describe("escapeHtml", () => {
  test("escapes quotes so a value cannot leave its attribute", () => {
    expect(escapeHtml(`"x' onmouseover=alert(1) <b>&`)).toBe(
      "&quot;x&#39; onmouseover=alert(1) &lt;b&gt;&amp;",
    );
  });
});

describe("notification digest links", () => {
  const html = (href: string) =>
    buildNotificationDigestHtml({
      appUrl: "https://app.eva.test/",
      notifications: [{ title: "Hi", type: "system", href, createdAt: 0 }],
    });

  test("an app path links into the app", () => {
    expect(html("/o/r/inbox")).toContain('href="https://app.eva.test/o/r/inbox"');
  });

  test("a path that could leave the app falls back to the app root", () => {
    const out = html("/\\evil.example");
    expect(out).not.toContain("evil.example");
    expect(out).toContain('href="https://app.eva.test"');
  });
});
