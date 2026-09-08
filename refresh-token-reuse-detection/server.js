const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Redis = require('ioredis');

const app = express();
app.use(express.json());

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6380');

// In a real app these come from env vars / secrets manager, and should differ.
const ACCESS_TOKEN_SECRET = 'dev-only-access-secret';
const REFRESH_TOKEN_SECRET = 'dev-only-refresh-secret';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;        // 15 minutes
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600; // 30 days
const FAMILY_KEY_TTL_SECONDS = REFRESH_TOKEN_TTL_SECONDS;

function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

function signRefreshToken(userId, familyId, tokenId) {
  return jwt.sign(
    { sub: userId, familyId, tokenId },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL_SECONDS }
  );
}

function familyKey(familyId) {
  return `refresh-family:${familyId}`;
}

/**
 * POST /login
 * Starts a new refresh token family. familyKey in Redis holds the
 * tokenId that is currently valid for this family.
 */
app.post('/login', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const familyId = uuidv4();
  const tokenId = uuidv4();

  await redis.set(
    familyKey(familyId),
    JSON.stringify({ tokenId, userId }),
    'EX',
    FAMILY_KEY_TTL_SECONDS
  );

  res.json({
    accessToken: signAccessToken(userId),
    refreshToken: signRefreshToken(userId, familyId, tokenId),
  });
});

/**
 * POST /refresh
 * - Verifies the refresh token's signature/expiry.
 * - Looks up the family's currently-valid tokenId in Redis.
 * - If it matches: rotate (issue new tokenId + tokens), update Redis.
 * - If it does NOT match: this token was already rotated away — reuse
 *   detected. Revoke the whole family immediately.
 */
app.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required' });
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  const { sub: userId, familyId, tokenId } = payload;
  const raw = await redis.get(familyKey(familyId));

  if (!raw) {
    // Family doesn't exist (expired or already revoked).
    return res.status(401).json({ error: 'Invalid or revoked refresh token' });
  }

  const current = JSON.parse(raw);

  if (current.tokenId !== tokenId) {
    // The presented token is not the current one for this family.
    // That means it was already rotated away and is now being reused
    // — a strong signal of token theft. Revoke the entire family.
    await redis.del(familyKey(familyId));
    return res.status(401).json({
      error: 'Refresh token reuse detected — session family revoked',
    });
  }

  // Legitimate rotation: issue a new tokenId and new tokens.
  const newTokenId = uuidv4();
  await redis.set(
    familyKey(familyId),
    JSON.stringify({ tokenId: newTokenId, userId }),
    'EX',
    FAMILY_KEY_TTL_SECONDS
  );

  res.json({
    accessToken: signAccessToken(userId),
    refreshToken: signRefreshToken(userId, familyId, newTokenId),
  });
});

/**
 * POST /logout
 * Revokes the family outright (e.g. user-initiated logout).
 */
app.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required' });
  }

  try {
    const { familyId } = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    await redis.del(familyKey(familyId));
  } catch (err) {
    // Already invalid/expired — nothing to do.
  }

  res.json({ message: 'Logged out' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`refresh-token-reuse-detection example listening on port ${PORT}`);
});
