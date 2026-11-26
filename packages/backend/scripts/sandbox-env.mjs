// The env vars an Eva sandbox's local Convex backend gets when it is seeded from
// a cloud deployment (`sync-to-local.mjs --sandbox-env`), read from
// `.eva/sandbox-env.json` at the repo root. That file maps each Convex app, by
// its path from the repo root ("apps/web"), to its vars. Allowlist: a source var
// that is not named there never reaches a sandbox, and the seed removes it.
//
// Rules:
//   "copy"                    the source deployment's value; only when sharing
//                             it is harmless (a public URL, a sender address)
//   "eva"                     the sandbox's own env var of the same name: an Eva
//                             repo env var with a test value, ideally Seed only.
//                             Left unset when Eva has none.
//   { "value": "..." }        a fixed, non-secret value
//   { "generate": "secret" }  32 random bytes as hex, new on every seed
//   { "generate": "es256-private-jwk", "kid": "...", "pair"?: "<name>" }
//   { "generate": "es256-jwks", "pair": "<name>" }  public half of that pair
// Object rules may add "why"; { "from": "copy" | "eva", "why": "..." } is the
// string form with a reason.
//
// Shared word for word by eva (packages/backend/scripts) and carepulse-ts
// (scripts); keep any fix appliable to both by diffing them.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const GENERATORS = new Set(["secret", "es256-private-jwk", "es256-jwks"]);

/** The nearest directory at or above `dir` that holds `.eva/`. */
function findEvaRoot(dir) {
  let current = dir;
  while (!existsSync(join(current, ".eva"))) {
    const parent = dirname(current);
    if (parent === current) throw new Error(`No .eva directory above ${dir}`);
    current = parent;
  }
  return current;
}

/** "copy" and "eva" may be written as { "from": ..., "why": ... }. */
function normalize(rule) {
  return typeof rule === "object" && rule !== null && "from" in rule
    ? rule.from
    : rule;
}

function checkRule(name, rule) {
  if (rule === "copy" || rule === "eva") return;
  const ok =
    typeof rule === "object" &&
    rule !== null &&
    (typeof rule.value === "string" ||
      (GENERATORS.has(rule.generate) &&
        (rule.generate !== "es256-private-jwk" ||
          typeof rule.kid === "string") &&
        (rule.generate !== "es256-jwks" || typeof rule.pair === "string")));
  if (!ok) throw new Error(`Invalid sandbox env rule for ${name}`);
}

/** The rules for the Convex app in `appDir`, validated. */
export function loadSandboxEnv(appDir) {
  const root = findEvaRoot(appDir);
  const file = join(root, ".eva", "sandbox-env.json");
  const appPath = relative(root, appDir).split(sep).join("/") || ".";
  const all = JSON.parse(readFileSync(file, "utf8"));
  const rules = all[appPath];
  if (rules === undefined) {
    throw new Error(`${file} has no "${appPath}" entry`);
  }
  const normalized = Object.fromEntries(
    Object.entries(rules).map(([name, rule]) => [name, normalize(rule)]),
  );
  for (const [name, rule] of Object.entries(normalized)) checkRule(name, rule);
  return normalized;
}

/** An ES256 key pair as JWKs, both carrying `kid`. */
export async function createEs256KeyPair(kid) {
  // Only repos with an es256 rule need jose installed.
  const { exportJWK, generateKeyPair } = await import("jose");
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  return {
    privateJwk: { ...(await exportJWK(privateKey)), kid, alg: "ES256" },
    publicJwk: {
      ...(await exportJWK(publicKey)),
      kid,
      alg: "ES256",
      use: "sig",
    },
  };
}

/**
 * Resolves every rule to a value. `readSource(name)` returns the source
 * deployment's value. Returns the values to set and the "eva" vars the
 * sandbox does not have.
 */
export async function resolveSandboxEnv(rules, readSource) {
  const pairKids = new Map(
    Object.values(rules).flatMap((rule) =>
      rule.generate === "es256-private-jwk" && rule.pair
        ? [[rule.pair, rule.kid]]
        : [],
    ),
  );
  const pairs = new Map();
  const pair = (name) => {
    if (!pairKids.has(name)) {
      throw new Error(`No es256-private-jwk rule has pair "${name}"`);
    }
    if (!pairs.has(name))
      pairs.set(name, createEs256KeyPair(pairKids.get(name)));
    return pairs.get(name);
  };

  const values = new Map();
  const missing = [];
  for (const [name, rule] of Object.entries(rules)) {
    if (rule === "copy") {
      values.set(name, readSource(name));
    } else if (rule === "eva") {
      const own = process.env[name];
      if (own) values.set(name, own);
      else missing.push(name);
    } else if (typeof rule.value === "string") {
      values.set(name, rule.value);
    } else if (rule.generate === "secret") {
      values.set(name, randomBytes(32).toString("hex"));
    } else if (rule.generate === "es256-private-jwk") {
      const keys = await (rule.pair
        ? pair(rule.pair)
        : createEs256KeyPair(rule.kid));
      values.set(name, JSON.stringify(keys.privateJwk));
    } else {
      const { publicJwk } = await pair(rule.pair);
      values.set(name, JSON.stringify({ keys: [publicJwk] }));
    }
  }
  return { values, missing };
}
