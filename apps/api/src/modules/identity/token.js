import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export function createRefreshToken() {
  return randomBytes(48).toString('base64url');
}

export function hashOpaqueToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createTokenService(env) {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return {
    issueAccessToken({ userId, sessionId, authVersion }) {
      return new SignJWT({ sid: String(sessionId), auth_version: authVersion })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(String(userId))
        .setIssuer(env.JWT_ISSUER)
        .setAudience(env.JWT_AUDIENCE)
        .setIssuedAt()
        .setJti(randomUUID())
        .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
        .sign(secret);
    },
    async verifyAccessToken(token) {
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ['HS256'],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
      });
      return payload;
    },
  };
}
