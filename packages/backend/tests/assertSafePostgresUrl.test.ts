import { expect, test } from "vitest";
import {
  assertSafePostgresUrlShape,
  isBlockedResolvedAddress,
} from "../convex/_mcp/assertSafePostgresUrl";

test("blocks loopback, RFC1918, link-local, and CGNAT addresses", () => {
  expect(isBlockedResolvedAddress("127.0.0.1")).toBe(true);
  expect(isBlockedResolvedAddress("10.0.0.1")).toBe(true);
  expect(isBlockedResolvedAddress("192.168.1.1")).toBe(true);
  expect(isBlockedResolvedAddress("172.16.0.1")).toBe(true);
  expect(isBlockedResolvedAddress("169.254.169.254")).toBe(true);
  expect(isBlockedResolvedAddress("100.64.0.1")).toBe(true);
  expect(isBlockedResolvedAddress("::1")).toBe(true);
  expect(isBlockedResolvedAddress("::ffff:169.254.169.254")).toBe(true);
  expect(isBlockedResolvedAddress("8.8.8.8")).toBe(false);
});

test("rejects localhost and .internal hosts before DNS", () => {
  expect(() =>
    assertSafePostgresUrlShape("postgresql://u:p@localhost/db"),
  ).toThrow(/not allowed/);
  expect(() =>
    assertSafePostgresUrlShape("postgresql://u:p@db.internal/db"),
  ).toThrow(/not allowed/);
  expect(() =>
    assertSafePostgresUrlShape("postgresql://u:p@127.0.0.1/db"),
  ).toThrow(/not allowed/);
  expect(() =>
    assertSafePostgresUrlShape("https://example.com/db"),
  ).toThrow(/postgres/);
});
