# MCP Server Security

The Eva MCP server runs in Convex (`packages/backend/convex/mcp/`). `POST /mcp` is the endpoint.

## Authentication

Eva is its own OAuth 2.0 authorization server. Register, authorize and token run on the Convex site (`CONVEX_SITE_URL`). Consent runs in the web app (`WEB_APP_URL`), because production Clerk keys are pinned to the primary web domain.

1. A client reads `/.well-known/oauth-protected-resource`. `authorization_servers` is this Convex site.
2. `/.well-known/oauth-authorization-server` is self-hosted. It lists `/mcp/oauth/authorize`, `/mcp/oauth/token` and `/mcp/oauth/register`. Only `code`, S256 PKCE and public clients (`none`) are supported.
3. `POST /mcp/oauth/register` stores the client and its `redirect_uris` in `mcpClientRegistrations` (24h TTL). Allowed URIs: any `https`, loopback `http` on `127.0.0.1`, `localhost` or `[::1]` at any port, and the Cursor callback.
4. `GET /mcp/oauth/authorize` needs `client_id`, `redirect_uri`, `state`, `code_challenge` and `code_challenge_method=S256`. `response_type` is optional (missing means `code`; any other value is rejected) and `scope` is ignored. It checks the client exists, then 302s with only these params to `WEB_APP_URL/mcp/oauth/authorize`.
5. The SPA route `apps/web/src/routes/mcp/oauth/authorize.tsx` signs the user in with Clerk and asks for consent. On "Allow access" it calls the `mcp.oauth.authorize` mutation, which checks the client, the redirect URI against the registered ones and S256, then stores a single-use code in `mcpAuthCodes` (5 min TTL). The page redirects to `redirect_uri` with `code` and `state`.
6. `POST /mcp/oauth/token` (form or JSON) consumes the code, checks `redirect_uri`, `client_id` and the PKCE verifier, and returns HS256 tokens signed with `MCP_JWT_SECRET` (`iss: eva`, `aud: mcp-oauth`): access 1h, refresh 30d. `grant_type=refresh_token` rotates both.
7. The client sends `Authorization: Bearer <token>` to `/mcp`. A missing or invalid token gets `401` with a `WWW-Authenticate` header that points to the resource metadata.

If Clerk bounces the consent popup to `/home` during its session handshake, `mcpOauthStorage.ts` (saved in `main.tsx` and the route `beforeLoad`) lets `/home` redirect back into the flow, at most twice.

Eva accepts these bearer tokens. `verifyAccessToken` tries them in this order:

| Token                         | Issuer                                | Check                                                                  | Scope                                          |
| ----------------------------- | ------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| Sandbox (`aud: mcp-internal`) | Eva, HS256 with `MCP_INTERNAL_SECRET` | `verifyAccessToken` checks the signature and claims                    | The user, plus `scopedRepoId`, entity and chat |
| Eva OAuth (`aud: mcp-oauth`)  | Eva, HS256 with `MCP_JWT_SECRET`      | `verifyAccessToken` checks the signature, then that the Clerk user exists | The user                                       |
| Clerk JWT access token        | Clerk                                 | `authenticateClerkBearer` checks signature, issuer and expiry locally  | The user                                       |
| Clerk opaque token            | Clerk                                 | `authenticateClerkBearer` falls back to `verifyAccessToken`            | The user                                       |

`authenticateMcpToken` checks `isEvaSignedToken` first. Eva-signed tokens go straight to `verifyAccessToken` and never reach the Clerk JWT path, which would reject their HS256 signature. A refresh token is never accepted as an access token. Clerk bearer tokens stay a working alternative.

## Security Measures

### Per-User Data Scoping

Every MCP tool resolves the Clerk user ID to a Convex user, then checks that the user can access the repo before it returns data. A sandbox token narrows access further to its `scopedRepoId`.

`/api/mcp/env-vars` in `http.ts` runs `checkRepoAccessForUser` before it returns credentials.

### Secret Separation

| Secret                 | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `MCP_JWT_SECRET`       | Signs and checks Eva OAuth (`mcp-oauth`) tokens       |
| `MCP_INTERNAL_SECRET`  | Signs and checks sandbox (`mcp-internal`) tokens      |
| `MCP_BOOTSTRAP_SECRET` | Authenticates the bootstrap call that returns the key |
| `CLERK_SECRET_KEY`     | Lets Eva verify Clerk tokens                          |

Sandbox signing (`SANDBOX_JWT_*`, `/.well-known/openid-configuration`, `/.well-known/jwks.json`) is separate and unchanged.

### Code Injection Defense

Tools that put user input into Convex query code (`get_document`, `count_table`) use `JSON.stringify()`, not string concatenation.

## Environment Variables (Convex)

| Variable                  | Purpose                                                                       |
| ------------------------- | ----------------------------------------------------------------------------- |
| `CLERK_JWT_ISSUER_DOMAIN` | Clerk issuer for local Clerk JWT verify (falls back to `CLERK_FRONTEND_API_URL`) |
| `CLERK_SECRET_KEY`        | Clerk opaque-token verification                                               |
| `CLERK_PUBLISHABLE_KEY`   | Clerk opaque-token verification (`authenticateRequest` needs it with the secret key) |
| `MCP_JWT_SECRET`          | Eva OAuth access and refresh token signing and checking                       |
| `MCP_INTERNAL_SECRET`     | Sandbox token signing and checking                                            |
| `MCP_BOOTSTRAP_SECRET`    | Bootstrap endpoint auth                                                       |
| `WEB_APP_URL`             | Where `/mcp/oauth/authorize` sends the user for sign-in and consent           |

The web app must point `VITE_CONVEX_URL` at the same deployment, so the consent page mints codes where the token endpoint reads them.

## Known Limitations

- **JWT revocation**: A Clerk JWT stays valid until it expires, because Eva checks it locally and does not call Clerk. An Eva `mcp-oauth` token is cut off at the next call once the Clerk user is deleted.
- **Open registration**: Any caller can register a client. Redirect URI rules and explicit consent limit the risk; there is no admin approval step.
- **No cleanup cron**: Expired codes are deleted when consumed. Expired client registrations stay in `mcpClientRegistrations` but are ignored after 24h.
