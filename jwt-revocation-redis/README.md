# JWT Revocation with Redis

Companion code for **[Revoke a JWT Before It Expires](https://devsaas.dev/blog/revoke-jwt-before-expiration)** on devsaas.dev.

JWTs are stateless by design, which is exactly why "logging out" or revoking one before its natural expiry is awkward. This example implements the standard fix: a Redis-backed denylist keyed by the token's `jti` (JWT ID), with the Redis key's TTL set to match the token's remaining lifetime — so the denylist entry expires on its own and never grows unbounded.

## How it works

1. On login, the server issues a JWT with a unique `jti` claim and a short expiry (15 minutes in this example).
2. On logout, the server writes `revoked:<jti>` to Redis with a TTL equal to the token's remaining time-to-live.
3. Every protected route checks Redis for `revoked:<jti>` before trusting the token — if it's there, the token is rejected even though it hasn't technically expired yet.
4. Because the Redis key's TTL mirrors the token's own expiry, revoked entries clean themselves up. No cron job, no unbounded list.

## Run it

```bash
docker compose up -d      # starts Redis on localhost:6379
npm install
npm start                 # server on localhost:3000
```

## Try it

```bash
# 1. Log in, get a token
curl -X POST localhost:3000/login -H "Content-Type: application/json" -d '{"userId":"u1"}'
# => { "token": "eyJ..." }

# 2. Call a protected route with the token
curl localhost:3000/protected -H "Authorization: Bearer <token>"
# => { "message": "Welcome u1" }

# 3. Log out (revokes the token)
curl -X POST localhost:3000/logout -H "Authorization: Bearer <token>"

# 4. Try the protected route again with the SAME token
curl localhost:3000/protected -H "Authorization: Bearer <token>"
# => 401 { "error": "Token has been revoked" }
```

## Key files

- `server.js` — Express app: login, logout, protected route, and the revocation middleware
- `docker-compose.yml` — single Redis container for local dev

## Things this does NOT cover

- Refresh token rotation (see [`../refresh-token-reuse-detection`](../refresh-token-reuse-detection) for that)
- Multi-device logout (revoking all sessions for a user, not just one token) — the article discusses the tradeoffs of a per-user version counter vs per-token denylist for that case
