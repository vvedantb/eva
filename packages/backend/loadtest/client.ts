// Minimal admin HTTP client for the load-test backend.
//
// ConvexHttpClient hides admin auth (`setAdminAuth` is @internal) and only
// types public functions, so this calls the same /api/query and /api/mutation
// endpoints directly. An admin key may act as any identity, which lets the
// runner call real public queries as the focal user without Clerk.
import { getFunctionName } from "convex/server";
import type { FunctionArgs, FunctionReference } from "convex/server";
import { z } from "zod";

const responseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"), value: z.unknown() }),
  z.object({ status: z.literal("error"), errorMessage: z.string() }),
]);

export type ActingIdentity = {
  subject: string;
  issuer: string;
  tokenIdentifier: string;
};

export class AdminClient {
  private readonly url: string;
  private readonly adminKey: string;
  constructor(url: string, adminKey: string) {
    this.url = url;
    this.adminKey = adminKey;
  }

  private authHeader(identity: ActingIdentity | undefined): string {
    if (!identity) return `Convex ${this.adminKey}`;
    const bytes = new TextEncoder().encode(JSON.stringify(identity));
    return `Convex ${this.adminKey}:${btoa(String.fromCodePoint(...bytes))}`;
  }

  /** Calls a function and returns its raw JSON value; callers parse it. */
  async call<Ref extends FunctionReference<"query" | "mutation", "public" | "internal">>(
    kind: Ref["_type"],
    ref: Ref,
    args: FunctionArgs<Ref>,
    identity?: ActingIdentity,
  ): Promise<unknown> {
    // The local backend rate-limits writes (4 MiB/s); seeding backs off.
    for (let attempt = 0; ; attempt++) {
      const res = await this.post(kind, ref, args, identity);
      if (res.status !== 429 || attempt >= 60) return await this.unwrap(res);
      await new Promise((resolve) => setTimeout(resolve, 250 + attempt * 100));
    }
  }

  private post<Ref extends FunctionReference<"query" | "mutation", "public" | "internal">>(
    kind: Ref["_type"],
    ref: Ref,
    args: FunctionArgs<Ref>,
    identity: ActingIdentity | undefined,
  ): Promise<Response> {
    return fetch(`${this.url}/api/${kind}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader(identity),
      },
      body: JSON.stringify({ path: getFunctionName(ref), format: "json", args: [args] }),
    });
  }

  private async unwrap(res: Response): Promise<unknown> {
    const text = await res.text();
    const parsed = responseSchema.safeParse(JSON.parse(text));
    // Non-UDF failures (bad path, auth, limits) come back as {code, message}.
    if (!parsed.success) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    if (parsed.data.status === "error") throw new Error(parsed.data.errorMessage);
    return parsed.data.value;
  }
}
