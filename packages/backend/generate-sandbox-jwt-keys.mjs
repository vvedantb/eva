import { generateKeyPair, exportJWK } from "jose";

// TO RUN THIS:
// cd packages/backend && node generate-sandbox-jwt-keys.mjs                                            

const { publicKey, privateKey } = await generateKeyPair("ES256", {
  extractable: true,
});

const pub = await exportJWK(publicKey);
pub.kid = "sandbox-1";
pub.alg = "ES256";
pub.use = "sig";

const priv = await exportJWK(privateKey);
priv.kid = "sandbox-1";
priv.alg = "ES256";

console.log("");
console.log("Set these as Convex environment variables on the dashboard:");
console.log("");
console.log("SANDBOX_JWT_PRIVATE_KEY:");
console.log(JSON.stringify(priv));
console.log("");
console.log("SANDBOX_JWT_JWKS:");
console.log(JSON.stringify({ keys: [pub] }));
console.log("");
