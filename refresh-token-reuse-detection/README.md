# Refresh Token Reuse Detection with Redis

Companion code for **[Detecting Refresh Token Reuse with Redis](https://devsaas.dev/blog/detect-refresh-token-reuse-redis)** on devsaas.dev.

Refresh token rotation means every time a refresh token is used, it's invalidated and a new one is issued. The hard part is: **what happens if someone uses an already-rotated (old) refresh token?** That's a strong signal the token was stolen — the legitimate client already moved to the newer token, so a request with the old one means someone else has a copy.

This example implements the standard mitigation: **token families**. Every refresh token belongs to a family (created at login). When a token in a family is reused after rotation, the entire family is revoked — logging out every session descended from that original login, not just the compromised token.

## How it works

1. On login, a refresh token family is created in Redis: `family:<familyId>` → the current valid token ID.
2. On refresh, the server checks: is the presented token ID the current one for its family?
   - **Yes** → rotate: generate a new token ID, update the family's pointer, issue new tokens.
   - **No** (the token ID doesn't match what's currently valid for that family) → this is a reused/stale token. Revoke the entire family immediately.
3. Revoking a family means every refresh token derived from that login stops working, forcing re-authentication.

## Run it

```bash
docker compose up -d
npm install
npm start                 # server on localhost:3001
```

## Try it

```bash
# 1. Log in — get an access token + refresh token
curl -X POST localhost:3001/login -H "Content-Type: application/json" -d '{"userId":"u1"}'
# => { "accessToken": "...", "refreshToken": "..." }

# 2. Use the refresh token normally — get a NEW refresh token back
curl -X POST localhost:3001/refresh -H "Content-Type: application/json" -d '{"refreshToken":"<refreshToken from step 1>"}'
# => { "accessToken": "...", "refreshToken": "<a NEW token>" }

# 3. Try to reuse the ORIGINAL (now-rotated) refresh token from step 1
curl -X POST localhost:3001/refresh -H "Content-Type: application/json" -d '{"refreshToken":"<refreshToken from step 1>"}'
# => 401 { "error": "Refresh token reuse detected — session family revoked" }

# 4. Even the valid token from step 2 now fails, because the whole family was revoked
curl -X POST localhost:3001/refresh -H "Content-Type: application/json" -d '{"refreshToken":"<refreshToken from step 2>"}'
# => 401 { "error": "Invalid or revoked refresh token" }
```

## Key files

- `server.js` — login, refresh (with rotation + reuse detection), and the Redis family-tracking logic
- `docker-compose.yml` — single Redis container for local dev

## Design notes

- Family IDs are created once at login and persist across every rotation in that session's lineage.
- We store the *current valid token ID* per family, not a list of all historical tokens — reuse detection only needs to know "is this the token I expect right now," which keeps the Redis footprint constant regardless of how many times a session refreshes.
- In production, pair this with alerting: a reuse event is a strong signal of token theft and worth logging/notifying on, not just silently revoking.
