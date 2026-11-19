import { Client } from "pg";
import { expect, test } from "vitest";
import {
  isBlockedPostgresAddress,
  safePostgresStream,
} from "../convex/_mcp/postgresSsrfGuard";

test("blocks loopback, private, link-local, CGNAT and mapped addresses", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::",
    "::1",
    "fe80::1",
    "fd00::1",
    "fd00:ec2::254",
    "::ffff:169.254.169.254",
    "::ffff:a9fe:a9fe",
    "64:ff9b::a9fe:a9fe",
    "not-an-ip",
  ]) {
    expect(isBlockedPostgresAddress(address), address).toBe(true);
  }
  for (const address of ["8.8.8.8", "172.32.0.1", "2606:4700::1"]) {
    expect(isBlockedPostgresAddress(address), address).toBe(false);
  }
});

async function connectError(connectionString: string): Promise<string> {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 2_000,
    stream: safePostgresStream,
  });
  try {
    await client.connect();
    return "connected";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  } finally {
    await client.end().catch(() => {});
  }
}

test("pg client refuses blocked hosts before any TCP connect", async () => {
  for (const url of [
    "postgresql://u:p@127.0.0.1:5432/db",
    "postgresql://u:p@localhost:5432/db",
    "postgresql://u:p@169.254.169.254:5432/db",
    // pg lets a ?host= query param override the URL host.
    "postgresql://u:p@example.com:5432/db?host=10.0.0.1",
    // Unix socket path.
    "postgresql://u:p@%2Fvar%2Frun%2Fpostgresql/db",
  ]) {
    expect(await connectError(url), url).toMatch(/not allowed/);
  }
  // pg passes "[::1]" with brackets, so DNS fails closed.
  expect(await connectError("postgresql://u:p@[::1]:5432/db")).toMatch(
    /ENOTFOUND/,
  );
});
