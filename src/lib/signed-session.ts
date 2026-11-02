import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

interface SessionClaims {
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  nonce: string;
}

export function signSession(audience: string, subject: string, secret: string, maxAge: number, now: number): string {
  if (secret.length < 32) throw new Error("Session secret must contain at least 32 characters");
  const claims: SessionClaims = { aud: audience, sub: subject, iat: now, exp: now + maxAge, nonce: randomBytes(24).toString("base64url") };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const message = `v1.${payload}`;
  return `${message}.${createHmac("sha256", secret).update(message).digest("base64url")}`;
}

export function readSession(token: string | undefined, audience: string, secret: string | undefined, maxAge: number, now: number): SessionClaims | null {
  if (!token || token.length > 2048 || !secret || secret.length < 32) return null;
  const parts = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!parts) return null;
  const expected = createHmac("sha256", secret).update(`v1.${parts[1]}`).digest("base64url");
  if (!timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as SessionClaims;
    if (claims.aud !== audience || typeof claims.sub !== "string" || !claims.sub ||
      typeof claims.nonce !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(claims.nonce) ||
      !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
      claims.iat > now || claims.exp <= now || claims.exp - claims.iat !== maxAge) return null;
    return claims;
  } catch {
    return null;
  }
}
