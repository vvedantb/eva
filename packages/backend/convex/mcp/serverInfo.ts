import { defineMcpServerInfo } from "@vvedantb/server";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";

const FALLBACK_WEB_APP_URL = "https://eva.vedantb.com";

/** MCP `serverInfo` for Eva's hosted /mcp; branding follows the deployment's WEB_APP_URL. */
export function evaMcpServerInfo(
  webAppUrl: string | undefined,
): Implementation {
  const websiteUrl =
    webAppUrl?.trim().replace(/\/+$/, "") || FALLBACK_WEB_APP_URL;
  return {
    ...defineMcpServerInfo({ name: "eva-mcp", version: "1.0.0" }),
    title: "Eva",
    websiteUrl,
    icons: [
      {
        src: `${websiteUrl}/icon.png`,
        mimeType: "image/png",
        sizes: ["1024x1024"],
      },
    ],
  };
}
