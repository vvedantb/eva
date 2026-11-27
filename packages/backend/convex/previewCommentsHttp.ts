import type { HttpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Preview comments for a direct sandbox link (`/preview-comments/{list,send,
 * resolve}`). The page sends the bearer token Eva minted at the link handshake
 * (`previewGrant.mintPreviewGrant`). CORS is open to any origin because the
 * token, not the origin, is the credential and no cookie is involved.
 */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-max-age": "600",
};

const OPS = ["list", "send", "resolve"] as const;

export function registerPreviewCommentRoutes(http: HttpRouter): void {
  for (const op of OPS) {
    const path = `/preview-comments/${op}`;
    http.route({
      path,
      method: "OPTIONS",
      handler: httpAction(async () => new Response(null, { headers: CORS })),
    });
    http.route({
      path,
      method: "POST",
      handler: httpAction(async (ctx, request) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) {
          return new Response(JSON.stringify({ error: "Missing token" }), {
            status: 401,
            headers: { ...CORS, "content-type": "application/json" },
          });
        }
        const result = await ctx.runAction(internal.previewCommentsNode.handle, {
          op,
          token,
          body: await request.text(),
        });
        return new Response(result.json, {
          status: result.status,
          headers: { ...CORS, "content-type": "application/json" },
        });
      }),
    });
  }
}
