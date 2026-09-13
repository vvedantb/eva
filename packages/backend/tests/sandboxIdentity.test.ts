import { expect, test } from "vitest";
import {
  isSandboxIdentity,
  isSandboxVmIdentity,
} from "../convex/_auth/sandboxIdentity";
import { SANDBOX_JWT_ISSUER } from "../convex/sandboxAuthConfig";

test("Clerk identities are neither sandbox nor VM", () => {
  const clerk = { issuer: "https://clerk.example" };
  expect(isSandboxIdentity(clerk)).toBe(false);
  expect(isSandboxVmIdentity(clerk)).toBe(false);
});

test("launch CONVEX_TOKEN is a sandbox VM identity", () => {
  const launch = { issuer: SANDBOX_JWT_ISSUER };
  expect(isSandboxIdentity(launch)).toBe(true);
  expect(isSandboxVmIdentity(launch)).toBe(true);
});

test("MCP impersonation JWTs share the issuer but are not the VM", () => {
  const mcp = { issuer: SANDBOX_JWT_ISSUER, evaMcp: true };
  expect(isSandboxIdentity(mcp)).toBe(true);
  expect(isSandboxVmIdentity(mcp)).toBe(false);
});
