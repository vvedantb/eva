import { describe, expect, it } from "bun:test";
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

  it("blanks every other scheme and anything unparsable", () => {
    expect(ensureHttps("javascript:alert(1)")).toBe("about:blank");
    expect(ensureHttps("data:text/html,<script>1</script>")).toBe(
      "about:blank",
    );
    expect(ensureHttps("not a url")).toBe("about:blank");
  });
});
