const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Redis = require('ioredis');

const app = express();
app.use(express.json());

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// In a real app this comes from an env var / secrets manager.
const JWT_SECRET = 'dev-only-secret-do-not-use-in-production';
const TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

/**
 * POST /login
 * Issues a JWT with a unique jti (JWT ID) claim.
 * The jti is what we key the revocation entry on later.
 */
app.post('/login', (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const jti = uuidv4();
  const token = jwt.sign(
    { sub: userId, jti },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL_SECONDS }
  );

  res.json({ token });
});

/**
 * Middleware: verifies the JWT signature/expiry, then checks Redis
 * to see if this specific token (by jti) has been revoked.
 */
async function requireValidToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const isRevoked = await redis.get(`revoked:${payload.jti}`);
  if (isRevoked) {
    return res.status(401).json({ error: 'Token has been revoked' });
  }

  req.user = payload;
  next();
}

/**
 * GET /protected
 * A route that requires a valid, non-revoked token.
 */
app.get('/protected', requireValidToken, (req, res) => {
  res.json({ message: `Welcome ${req.user.sub}` });
});

/**
 * POST /logout
 * Revokes the current token by writing revoked:<jti> to Redis
 * with a TTL matching the token's own remaining lifetime.
 * This means the revocation entry expires on its own — no cleanup job needed.
 */
app.post('/logout', requireValidToken, async (req, res) => {
  const { jti, exp } = req.user;
  const remainingSeconds = exp - Math.floor(Date.now() / 1000);

  if (remainingSeconds > 0) {
    await redis.set(`revoked:${jti}`, '1', 'EX', remainingSeconds);
  }

  res.json({ message: 'Logged out, token revoked' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`jwt-revocation-redis example listening on port ${PORT}`);
});
