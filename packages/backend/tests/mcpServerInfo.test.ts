import { describe, expect, it } from "vitest";
import { evaMcpServerInfo } from "../convex/mcp/serverInfo";

describe("evaMcpServerInfo", () => {
  it("advertises title, website and icon from WEB_APP_URL", () => {
    expect(evaMcpServerInfo("https://work.example.com/")).toEqual({
      name: "eva-mcp",
      version: "1.0.0",
      title: "Eva",
      websiteUrl: "https://work.example.com",
      icons: [
        {
          src: "https://work.example.com/icon.png",
          mimeType: "image/png",
          sizes: ["1024x1024"],
        },
      ],
    });
  });

  it.each([undefined, "", "  "])(
    "falls back to eva.vedantb.com for %j",
    (env) => {
      const info = evaMcpServerInfo(env);
      expect(info.websiteUrl).toBe("https://eva.vedantb.com");
      expect(info.icons?.[0]?.src).toBe("https://eva.vedantb.com/icon.png");
    },
  );
});
