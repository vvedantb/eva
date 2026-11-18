import { createSandboxJwtKeys } from "./scripts/sandboxEnv.mjs";

// TO RUN THIS:
// cd packages/backend && node generate-sandbox-jwt-keys.mjs

const { privateKey, jwks } = await createSandboxJwtKeys();

console.log("");
console.log("Set these as Convex environment variables on the dashboard:");
console.log("");
console.log("SANDBOX_JWT_PRIVATE_KEY:");
console.log(privateKey);
console.log("");
console.log("SANDBOX_JWT_JWKS:");
console.log(jwks);
console.log("");
