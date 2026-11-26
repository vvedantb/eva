"use node";

import { lookup } from "node:dns";
import { BlockList, isIP, Socket, type LookupFunction } from "node:net";

/**
 * Addresses a repo-supplied Postgres URL must never reach: loopback, private,
 * link-local (cloud metadata), CGNAT, multicast and reserved ranges. BlockList
 * also matches IPv4-mapped IPv6 (`::ffff:a9fe:a9fe`) against the IPv4 rules.
 */
const BLOCKED = new BlockList();
BLOCKED.addSubnet("0.0.0.0", 8, "ipv4");
BLOCKED.addSubnet("10.0.0.0", 8, "ipv4");
BLOCKED.addSubnet("100.64.0.0", 10, "ipv4"); // CGNAT
BLOCKED.addSubnet("127.0.0.0", 8, "ipv4");
BLOCKED.addSubnet("169.254.0.0", 16, "ipv4"); // link-local, cloud metadata
BLOCKED.addSubnet("172.16.0.0", 12, "ipv4");
BLOCKED.addSubnet("192.0.0.0", 24, "ipv4");
BLOCKED.addSubnet("192.168.0.0", 16, "ipv4");
BLOCKED.addSubnet("198.18.0.0", 15, "ipv4");
BLOCKED.addSubnet("224.0.0.0", 3, "ipv4"); // multicast, reserved, broadcast
BLOCKED.addSubnet("::", 96, "ipv6"); // unspecified, loopback, IPv4-compatible
BLOCKED.addSubnet("64:ff9b::", 96, "ipv6"); // NAT64 can embed a private IPv4
BLOCKED.addSubnet("64:ff9b:1::", 48, "ipv6");
BLOCKED.addSubnet("fc00::", 7, "ipv6"); // unique local, includes fd00::/8
BLOCKED.addSubnet("fe80::", 10, "ipv6"); // link-local
BLOCKED.addSubnet("ff00::", 8, "ipv6"); // multicast

export function isBlockedPostgresAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return BLOCKED.check(address, "ipv4");
  if (family === 6) return BLOCKED.check(address, "ipv6");
  return true;
}

const BLOCKED_MESSAGE = "Postgres host is not allowed";

/**
 * DNS lookup that fails when any resolved address is blocked. The socket
 * connects to the addresses this lookup returns, so the check and the
 * connection see the same DNS answer (no rebinding window).
 */
export const safePostgresLookup: LookupFunction = (
  hostname,
  options,
  callback,
) => {
  lookup(hostname, { family: options.family, all: true }, (err, addresses) => {
    if (err) {
      callback(err, "");
      return;
    }
    const first = addresses[0];
    if (
      !first ||
      addresses.some((entry) => isBlockedPostgresAddress(entry.address))
    ) {
      callback(new Error(BLOCKED_MESSAGE), "");
      return;
    }
    if (options.all) {
      callback(null, addresses);
      return;
    }
    callback(null, first.address, first.family);
  });
};

/**
 * TCP socket for node-postgres (`new Client({ stream: safePostgresStream })`).
 * pg calls `connect(port, host)` with whatever host it parsed from the URL
 * (including a `?host=` override), so the guard sits here, not on the URL.
 * Node skips `lookup` for IP literals, so those are checked directly. Unix
 * socket paths and other connect forms are refused.
 */
class SafePostgresSocket extends Socket {
  override connect(
    portOrOptions: number | string | object,
    host?: string | (() => void),
  ): this {
    if (
      typeof portOrOptions !== "number" ||
      typeof host !== "string" ||
      (isIP(host) !== 0 && isBlockedPostgresAddress(host))
    ) {
      process.nextTick(() => this.destroy(new Error(BLOCKED_MESSAGE)));
      return this;
    }
    return super.connect({
      port: portOrOptions,
      host,
      lookup: safePostgresLookup,
    });
  }
}

export function safePostgresStream(): Socket {
  return new SafePostgresSocket();
}
