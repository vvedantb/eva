import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { z } from "zod";
import { sendEmailTool } from "../convex/_mcp/sendEmailTool";

const testsDir = dirname(fileURLToPath(import.meta.url));

function convexSource(path: string): string {
  return readFileSync(join(testsDir, "../convex", path), "utf8");
}

/** Any field that would let a caller choose who the mail goes to. */
const RECIPIENT_FIELD = /\b(to|email|recipient|cc|bcc)\s*:/;

test("send_email is registered for every MCP caller", () => {
  const tools = convexSource("mcp/tools.ts");
  const registered = tools.indexOf("sendEmailTool(");
  const gate = tools.indexOf("if (isOrchestrator) {");
  expect(registered).toBeGreaterThan(-1);
  expect(gate).toBeGreaterThan(registered);
});

test("send_email takes no recipient", () => {
  const shared = convexSource("_mcp/sendEmailTool.ts");
  const shape = shared.slice(
    shared.indexOf("sendEmailInputShape"),
    shared.indexOf("satisfies z.ZodRawShape"),
  );
  expect(shape).toContain("subject:");
  expect(shape).toContain("body:");
  expect(shape).not.toMatch(RECIPIENT_FIELD);
  expect(shared).toContain("mutating: true");
  expect(shared).toContain('name: "send_email"');
});

test("the action derives the recipient from userId only", () => {
  const action = convexSource("mcp/sendEmail.ts");
  const run = action.slice(action.indexOf("export const runSendEmail"));
  const args = run.slice(run.indexOf("args:"), run.indexOf("returns:"));
  expect(args).toContain("userId: v.string()");
  expect(args).toContain("subject: v.string()");
  expect(args).toContain("body: v.string()");
  expect(args).not.toMatch(RECIPIENT_FIELD);
  expect(action).toContain("internal.users.getEmailRecipientById");
  expect(action).toContain("sendEmail(");
});

test("the recipient lookup normalises the id instead of casting", () => {
  const users = convexSource("users.ts");
  const start = users.indexOf("export const getEmailRecipientById");
  expect(start).toBeGreaterThan(-1);
  const rest = users.slice(start);
  const next = rest.indexOf("export const", "export const".length);
  const lookup = next === -1 ? rest : rest.slice(0, next);
  expect(lookup).toContain('ctx.db.normalizeId("users"');
  expect(lookup).not.toContain(" as Id<");
});

/** Shape of the JSON block the tool returns on success. */
const sentPayload = z.object({ status: z.string(), to: z.string() });

/** What the tool layer actually forwards to the injected action. */
interface SeenCall {
  subject: string;
  body: string;
  keys: string[];
}

test("the tool forwards only a trimmed subject and body", async () => {
  const seen: SeenCall[] = [];
  const tool = sendEmailTool(async (input) => {
    seen.push({
      subject: input.subject,
      body: input.body,
      keys: Object.keys(input),
    });
    return { ok: true, to: "user@example.com" };
  });

  const result = await tool.invoke(
    JSON.stringify({ subject: "  Report ready ", body: "# Done\n\nAll green." }),
  );
  expect(result.isError).toBeUndefined();
  const [block] = result.content;
  if (block?.type !== "text") throw new Error("expected a text block");
  const payload = sentPayload.parse(JSON.parse(block.text));
  expect(payload.status).toBe("sent");
  expect(payload.to).toBe("user@example.com");
  expect(seen).toHaveLength(1);
  expect(seen[0]?.subject).toBe("Report ready");
  expect(seen[0]?.body).toBe("# Done\n\nAll green.");

  // A caller-supplied recipient is stripped at the boundary, not honoured.
  await tool.invoke(
    JSON.stringify({ subject: "x", body: "y", to: "evil@example.com" }),
  );
  expect(seen).toHaveLength(2);
  expect([...(seen[1]?.keys ?? [])].sort()).toEqual(["body", "subject"]);
});

test("a failed send comes back as an agent-facing error", async () => {
  const tool = sendEmailTool(async () => ({
    ok: false,
    errorCode: "no_email",
    error: "",
  }));
  const result = await tool.invoke(
    JSON.stringify({ subject: "x", body: "y" }),
  );
  expect(result.isError).toBe(true);
  const [block] = result.content;
  if (block?.type !== "text") throw new Error("expected a text block");
  expect(block.text.length).toBeGreaterThan(0);
});
