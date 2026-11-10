import { describe, expect, it } from "vitest";
import { ensureHttps } from "./ensureHttps";

describe("ensureHttps", () => {
  it("upgrades http and keeps https", () => {
    expect(ensureHttps("http://sbx.vercel.run/a?b=1")).toBe(
      "https://sbx.vercel.run/a?b=1",
    );
    expect(ensureHttps("https://sbx.vercel.run/")).toBe(
      "https://sbx.vercel.run/",
    );
  });

  // The result is an iframe src or a new-tab href: a script URL would run in
  // the app's origin.
  it("blanks every other scheme and anything unparsable", () => {
    expect(ensureHttps("javascript:alert(1)")).toBe("about:blank");
    expect(ensureHttps("data:text/html,<script>1</script>")).toBe(
      "about:blank",
    );
    expect(ensureHttps("not a url")).toBe("about:blank");
  });
});
