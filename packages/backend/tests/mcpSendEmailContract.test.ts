import { expect, test } from "vitest";
import { z } from "zod";
import { sendEmailTool } from "../convex/_mcp/sendEmailTool";

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
