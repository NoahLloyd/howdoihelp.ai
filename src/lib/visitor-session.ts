import { randomUUID } from "node:crypto";
import { readSession, signSession } from "./signed-session";

export const VISITOR_SESSION_COOKIE = "hdih_visitor_session";
export const VISITOR_SESSION_MAX_AGE = 60 * 60 * 24 * 90;

export function readVisitorSession(token: string | undefined, now = Math.floor(Date.now() / 1000)): string | null {
  const subject = readSession(token, "visitor", process.env.VISITOR_SESSION_SECRET, VISITOR_SESSION_MAX_AGE, now)?.sub;
  return subject && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(subject) ? subject : null;
}

export function createVisitorSession(id: string = randomUUID(), now = Math.floor(Date.now() / 1000)) {
  const secret = process.env.VISITOR_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Visitor sessions are not configured");
  return { id, token: signSession("visitor", id, secret, VISITOR_SESSION_MAX_AGE, now) };
}
