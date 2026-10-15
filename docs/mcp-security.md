# MCP Server Security

This document covers the security measures implemented in the Eva MCP server (`apps/mcp/`).

## Authentication Flow

The MCP server uses OAuth 2.0 with PKCE for authentication. Users sign in via Clerk, and the server issues short-lived JWTs for MCP access.

1. Client registers via `/oauth/register` with redirect URIs
2. User authenticates via Clerk on `/oauth/authorize`
3. Server issues an authorization code (PKCE-protected, 5 min TTL)
4. Client exchanges code for tokens via `/oauth/token`
5. Access token (1h) used for MCP requests, refresh token (30d) for renewal

## Security Measures

### Per-User Data Scoping

Every MCP tool resolves the authenticated user's Clerk ID to a Convex user ID, then verifies the user has access to the requested repo before returning any data. Access is checked at two layers:

- **MCP app layer**: `resolveTargetWithAccess()` in `tools.ts` checks repo ownership or team membership before making any data queries
- **Convex endpoint layer**: `/api/mcp/env-vars` in `http.ts` runs `checkRepoAccessForUser` server-side before returning credentials

### Secret Separation

Two independent secrets are used:

- **`MCP_JWT_SECRET`**: Signs and verifies JWT access/refresh tokens. Only needed in the MCP app (Railway).
- **`EVA_DEPLOY_KEY`**: Authenticates calls to `/api/mcp/env-vars`. Set in Convex env vars.

If one leaks, the other remains secure.

### Client Registration Validation

OAuth clients must register via `/oauth/register` before starting an auth flow. Registrations are stored with their declared `redirect_uris` and auto-expire after 24 hours.

- `/oauth/authorize` rejects unknown `client_id` values
- `redirect_uri` is validated against the URIs registered for that client
- Token exchange rejects unknown `client_id` values
- MCP clients re-register on server restart (in-memory store is acceptable)

### Token Lifecycle

- Access tokens expire after 1 hour
- Refresh tokens expire after 30 days
- Every MCP request re-validates the user exists in Clerk (catches deleted/revoked users immediately)
- Refresh token grant issues a new access + refresh token pair

### Constant-Time Comparisons

All secret/token comparisons use `timingSafeEqual()` to prevent timing attacks:

- Bootstrap token verification
- Deploy key verification
- GitHub webhook HMAC verification
- Streaming heartbeat HMAC verification

### Error Sanitization

Error responses to clients are generic ("Authentication failed", "Internal server error"). Detailed error information is logged server-side only, preventing information leakage.

### Rate Limiting

Express rate limiters protect against brute-force and abuse:

| Endpoint          | Limit            |
| ----------------- | ---------------- |
| `/oauth/token`    | 10 requests/min  |
| `/oauth/register` | 20 requests/min  |
| `POST /mcp`       | 100 requests/min |

### Code Injection Defense

Tools that interpolate user input into Convex query code (`get_document`, `count_table`) use `JSON.stringify()` for safe interpolation rather than string concatenation.

## Environment Variables

| Variable                | Where            | Purpose                                    |
| ----------------------- | ---------------- | ------------------------------------------ |
| `MCP_JWT_SECRET`        | Railway          | JWT signing/verification                   |
| `CLERK_PUBLISHABLE_KEY` | Railway          | Clerk sign-in UI                           |
| `CLERK_SECRET_KEY`      | Railway          | Clerk token verification + user validation |
| `CONVEX_CLOUD_URL`      | Railway          | Convex API endpoint                        |
| `EVA_DEPLOY_KEY`        | Convex           | Auth for `/api/mcp/env-vars`               |

## Known Limitations

- **In-memory stores**: Auth codes, client registrations, and credential caches are in-memory. They don't survive server restarts. This is acceptable because MCP clients automatically retry the OAuth flow on failure.
- **No client approval flow**: Any caller can register a client via `/oauth/register`. The redirect URI validation mitigates the risk, but there's no admin approval step.
