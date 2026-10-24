# MCP Server Security

The Eva MCP server runs in Convex (`packages/backend/convex/mcp/`). `POST /mcp` is the endpoint.

## Authentication

Clerk is the OAuth 2.0 authorization server. Eva does not register clients, show a consent screen or issue tokens.

1. A client reads `/.well-known/oauth-protected-resource`. It lists Clerk as the authorization server.
2. `/.well-known/oauth-authorization-server` proxies Clerk metadata for older clients.
3. The client registers, authorizes and gets tokens from Clerk, with PKCE.
4. The client sends the Clerk token as `Authorization: Bearer <token>` to `/mcp`.
5. A missing or invalid token gets `401` with a `WWW-Authenticate` header that points to the resource metadata.

Eva accepts two kinds of bearer token:

| Token                                  | Issuer                                | Check                                                                | Scope                                          |
| -------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| Clerk JWT access token                 | Clerk                                 | `authenticateClerkBearer` checks signature, issuer and expiry locally | The user                                       |
| Clerk opaque token                     | Clerk                                 | `authenticateClerkBearer` falls back to `verifyAccessToken`          | The user                                       |
| Sandbox (`aud: mcp-internal`)          | Eva, HS256 with `MCP_INTERNAL_SECRET` | `verifyAccessToken` checks the signature and claims                  | The user, plus `scopedRepoId`, entity and chat |

`authenticateMcpToken` checks `isInternalToken` first. A sandbox token goes straight to `verifyAccessToken` and never reaches the Clerk JWT path, which would reject its HS256 signature. A Clerk JWT that fails the local check is not retried with Clerk.

Eva no longer signs `mcp-oauth` tokens. Every MCP client had to sign in again when this change shipped.

## Security Measures

### Per-User Data Scoping

Every MCP tool resolves the Clerk user ID to a Convex user, then checks that the user can access the repo before it returns data. A sandbox token narrows access further to its `scopedRepoId`.

`/api/mcp/env-vars` in `http.ts` runs `checkRepoAccessForUser` before it returns credentials.

### Secret Separation

| Secret                 | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `MCP_INTERNAL_SECRET`  | Signs and checks sandbox (`mcp-internal`) tokens      |
| `MCP_BOOTSTRAP_SECRET` | Authenticates the bootstrap call that returns the key |
| `CLERK_SECRET_KEY`     | Lets Eva verify Clerk tokens                          |

Sandbox signing (`SANDBOX_JWT_*`, `/.well-known/openid-configuration`, `/.well-known/jwks.json`) is separate and unchanged.

### Code Injection Defense

Tools that put user input into Convex query code (`get_document`, `count_table`) use `JSON.stringify()`, not string concatenation.

## Environment Variables (Convex)

| Variable                  | Purpose                                                                       |
| ------------------------- | ----------------------------------------------------------------------------- |
| `CLERK_JWT_ISSUER_DOMAIN` | Clerk issuer for OAuth metadata and local JWT verify (falls back to `CLERK_FRONTEND_API_URL`) |
| `CLERK_SECRET_KEY`        | Clerk opaque-token verification                                               |
| `CLERK_PUBLISHABLE_KEY`   | Clerk opaque-token verification (`authenticateRequest` needs it with the secret key) |
| `MCP_INTERNAL_SECRET`     | Sandbox token signing and checking                                            |
| `MCP_BOOTSTRAP_SECRET`    | Bootstrap endpoint auth                                                       |
| `WEB_APP_URL`             | `resource_documentation` in the protected resource metadata                   |

`MCP_JWT_SECRET` is no longer read. Remove it from Convex env when convenient.

## Known Limitations

- **JWT revocation**: A Clerk JWT stays valid until it expires, because Eva checks it locally and does not call Clerk.
- **Unused tables**: `mcpAuthCodes` and `mcpClientRegistrations` stay in the schema until a drain migration removes them. `mcpTokenCache` also stays until `dataMigrations:drainMcpTokenCache` empties it. A follow-up PR then removes the table.
