import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../convex/auth.ts"),
  "utf8",
);
const body = definitionBody(source, "ensureUserExists");

describe("ensureUserExists identity recovery", () => {
  test("looks up the stable Clerk identity before the email fallback", () => {
    const clerkLookupAt = body.indexOf('withIndex("by_clerk_id"');
    const emailLookupAt = body.indexOf('withIndex("by_email"');
    expect(clerkLookupAt).toBeGreaterThan(-1);
    expect(emailLookupAt).toBeGreaterThan(clerkLookupAt);
  });

  test("never performs the fallback for an identity without a verified email", () => {
    const emailGuardAt = body.indexOf(
      "if (email && identity.emailVerified === true) {",
    );
    const emailLookupAt = body.indexOf('withIndex("by_email"');
    expect(emailGuardAt).toBeGreaterThan(-1);
    expect(emailLookupAt).toBeGreaterThan(emailGuardAt);
  });

  test("rebinds the existing record instead of inserting a duplicate", () => {
    const emailLookupAt = body.indexOf('withIndex("by_email"');
    const patchAt = body.indexOf(
      "ctx.db.patch(userWithSameEmail._id",
      emailLookupAt,
    );
    const insertAt = body.indexOf('ctx.db.insert("users"', emailLookupAt);
    expect(patchAt).toBeGreaterThan(emailLookupAt);
    expect(patchAt).toBeLessThan(insertAt);
    expect(body.slice(patchAt, insertAt)).toContain("clerkId: clerkUserId");
    expect(body.slice(patchAt, insertAt)).toContain("wasCreated: false");
  });

  test("inserts only after both lookup paths miss", () => {
    const emailLookupAt = body.indexOf('withIndex("by_email"');
    const insertAt = body.indexOf('ctx.db.insert("users"');
    expect(insertAt).toBeGreaterThan(emailLookupAt);
    expect(body.slice(insertAt)).toContain("wasCreated: true");
  });
});

function definitionBody(input: string, name: string): string {
  const startAt = input.indexOf(`export const ${name} =`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const endAt = input.indexOf("\n});", startAt);
  return input.slice(startAt, endAt < 0 ? undefined : endAt);
}
