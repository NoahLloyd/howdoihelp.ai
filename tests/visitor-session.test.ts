import assert from "node:assert/strict";
import test from "node:test";
import { createVisitorSession, readVisitorSession, VISITOR_SESSION_MAX_AGE } from "../src/lib/visitor-session";
import { createAdminSession, verifyAdminSession } from "../src/lib/admin-session";
import { parseVisitorUpdates } from "../src/lib/visitor-updates";

process.env.VISITOR_SESSION_SECRET = "visitor-test-secret-at-least-32-characters";
process.env.ADMIN_SESSION_SECRET = "separate-admin-test-secret-at-least-32-characters";
process.env.ADMIN_PASSWORD = "test-password";

test("visitor identities are server-issued and tampering, expiry and wrong audience are rejected", () => {
  const now = 1_800_000_000;
  const session = createVisitorSession(undefined, now);
  assert.equal(readVisitorSession(session.token, now), session.id);
  assert.notEqual(session.id, createVisitorSession(undefined, now).id);
  assert.equal(readVisitorSession(session.token, now + VISITOR_SESSION_MAX_AGE), null);
  assert.equal(readVisitorSession(session.token, now - 1), null);
  assert.equal(readVisitorSession(`${session.token}x`, now), null);
  assert.equal(readVisitorSession(session.id, now), null);
  assert.equal(readVisitorSession(undefined, now), null);
  assert.equal(readVisitorSession(createAdminSession(now), now), null);
  assert.equal(verifyAdminSession(session.token, now), false);
  const secret = process.env.VISITOR_SESSION_SECRET;
  try {
    delete process.env.VISITOR_SESSION_SECRET;
    assert.equal(readVisitorSession(session.token, now), null);
    assert.throws(() => createVisitorSession());
  } finally {
    process.env.VISITOR_SESSION_SECRET = secret;
  }
});

test("a returning visitor retains only the identity from their verified cookie", () => {
  const first = createVisitorSession();
  const id = readVisitorSession(first.token);
  const next = createVisitorSession(id!);
  assert.equal(next.id, first.id);
  assert.notEqual(next.token, first.token);
});

test("visitor writes reject client-selected row IDs and unexpected or invalid fields", () => {
  for (const invalid of [null, [], {}, {id:"victim"}, {created_at:"2026-01-01"}, {role:"admin"}, {profile_data:[]}, {profile_url:{}}, {answers:"invalid"}, {last_recommendations:{}}, {profile_url:"x".repeat(4097)}]) {
    assert.equal(parseVisitorUpdates(invalid), null);
  }
  const updates = {profile_data:{name:"Synthetic test"}, answers:{time:"30min"}, last_recommendations:[], profile_url:"https://example.com"};
  assert.deepEqual(parseVisitorUpdates(updates), updates);
});
