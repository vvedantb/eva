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

  async call<Ref extends FunctionReference<"query" | "mutation", "public" | "internal">>(
    kind: Ref["_type"],
    ref: Ref,
    args: FunctionArgs<Ref>,
    identity?: ActingIdentity,
  ): Promise<unknown> {
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
    if (!parsed.success) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    if (parsed.data.status === "error") throw new Error(parsed.data.errorMessage);
    return parsed.data.value;
  }
}
