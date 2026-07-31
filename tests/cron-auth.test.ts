import assert from "node:assert/strict";
import test from "node:test";
import { getCronAuthFailure } from "../src/lib/cron-auth";

test("cron auth fails closed when the deployment secret is missing", () => {
  const request = new Request("https://example.com/api/cron/test");
  assert.deepEqual(getCronAuthFailure(request, undefined), {
    error: "Cron is not configured",
    status: 503,
  });
});

test("cron auth rejects an invalid bearer token", () => {
  const request = new Request("https://example.com/api/cron/test", {
    headers: { authorization: "Bearer wrong" },
  });
  assert.deepEqual(getCronAuthFailure(request, "correct"), {
    error: "Unauthorized",
    status: 401,
  });
});

test("cron auth accepts the configured bearer token", () => {
  const request = new Request("https://example.com/api/cron/test", {
    headers: { authorization: "Bearer correct" },
  });
  assert.equal(getCronAuthFailure(request, "correct"), null);
});
