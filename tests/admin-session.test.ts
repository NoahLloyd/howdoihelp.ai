import assert from "node:assert/strict";
import test from "node:test";
import { createAdminSession, verifyAdminSession, isValidAdminPassword, ADMIN_SESSION_MAX_AGE } from "../src/lib/admin-session";

process.env.ADMIN_PASSWORD = "test-password-never-used-in-production";
process.env.ADMIN_SESSION_SECRET = "a-test-secret-with-at-least-32-characters";

test("hand-typed fixed cookie, missing and malformed cookies cannot authenticate", () => {
  for (const value of [undefined, "", "authenticated", "v1.e30.forged", "a".repeat(5000)]) {
    assert.equal(verifyAdminSession(value), false);
  }
});

test("login sessions are random, authenticated and expire after one week", () => {
  const now = 1_800_000_000;
  const token = createAdminSession(now);
  assert.notEqual(token, createAdminSession(now));
  assert.equal(verifyAdminSession(token, now), true);
  assert.equal(verifyAdminSession(token, now + ADMIN_SESSION_MAX_AGE - 1), true);
  assert.equal(verifyAdminSession(token, now + ADMIN_SESSION_MAX_AGE), false);
  assert.equal(verifyAdminSession(token, now - 1), false);
  const [version, payload, signature] = token.split(".");
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
  parsed.exp += 86_400;
  assert.equal(verifyAdminSession(`${version}.${Buffer.from(JSON.stringify(parsed)).toString("base64url")}.${signature}`, now), false);
  assert.equal(verifyAdminSession(`${token.slice(0, -1)}!`, now), false);
});

test("missing configuration fails closed and rotating password or secret revokes sessions", () => {
  const password = process.env.ADMIN_PASSWORD!;
  const secret = process.env.ADMIN_SESSION_SECRET!;
  const token = createAdminSession();
  try {
    process.env.ADMIN_PASSWORD = "changed-password";
    assert.equal(verifyAdminSession(token), false);
    process.env.ADMIN_PASSWORD = password;
    process.env.ADMIN_SESSION_SECRET = "changed-secret-with-at-least-32-characters";
    assert.equal(verifyAdminSession(token), false);
    delete process.env.ADMIN_SESSION_SECRET;
    assert.equal(verifyAdminSession(token), false);
    assert.throws(() => createAdminSession());
    process.env.ADMIN_SESSION_SECRET = secret;
    delete process.env.ADMIN_PASSWORD;
    assert.equal(isValidAdminPassword(password), false);
    assert.equal(verifyAdminSession(token), false);
    assert.throws(() => createAdminSession());
  } finally {
    process.env.ADMIN_PASSWORD = password;
    process.env.ADMIN_SESSION_SECRET = secret;
  }
});

test("password comparison rejects absent and incorrect passwords", () => {
  assert.equal(isValidAdminPassword("test-password-never-used-in-production"), true);
  assert.equal(isValidAdminPassword("wrong"), false);
  assert.equal(isValidAdminPassword(""), false);
});
