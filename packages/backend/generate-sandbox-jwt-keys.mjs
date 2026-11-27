import { createEs256KeyPair } from "./scripts/sandbox-env.mjs";


const { privateJwk, publicJwk } = await createEs256KeyPair("sandbox-1");

console.log("");
console.log("Set these as Convex environment variables on the dashboard:");
console.log("");
console.log("SANDBOX_JWT_PRIVATE_KEY:");
console.log(JSON.stringify(privateJwk));
console.log("");
console.log("SANDBOX_JWT_JWKS:");
console.log(JSON.stringify({ keys: [publicJwk] }));
console.log("");
