import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readSession, signSession } from "./signed-session";

export const ADMIN_SESSION_COOKIE = "admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

// Binding the signing key to the password revokes all sessions on either rotation.
function sessionKey(): string | undefined {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const password = process.env.ADMIN_PASSWORD;
  if (!secret || secret.length < 32 || !password?.trim()) return undefined;
  return createHmac("sha256", secret).update(password).digest("hex");
}

export function isValidAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected?.trim() || typeof password !== "string" || !password.trim()) return false;
  const digest = (value: string) => createHash("sha256").update(value.trim()).digest();
  return timingSafeEqual(digest(password), digest(expected));
}

export function createAdminSession(now = Math.floor(Date.now() / 1000)): string {
  const key = sessionKey();
  if (!key) throw new Error("Admin authentication is not configured");
  return signSession("admin", "admin", key, ADMIN_SESSION_MAX_AGE, now);
}

export function verifyAdminSession(token: string | undefined, now = Math.floor(Date.now() / 1000)): boolean {
  return readSession(token, "admin", sessionKey(), ADMIN_SESSION_MAX_AGE, now)?.sub === "admin";
}
