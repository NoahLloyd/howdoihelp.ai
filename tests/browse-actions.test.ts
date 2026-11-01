import assert from "node:assert/strict";
import test from "node:test";

import { assignActionSub, sortActions } from "../src/lib/browse-actions";
import { resources } from "../src/data/resources";
import type { Resource } from "../src/types";

function resource(overrides: Partial<Resource>): Resource {
  return {
    id: "row",
    title: "Row",
    description: "",
    url: "https://example.com",
    source_org: "Org",
    category: "other",
    location: "Global",
    min_minutes: 5,
    ev_general: 0.5,
    friction: 0.1,
    enabled: true,
    status: "approved",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("letters, contact tools, and unlisted actions go to Quick", () => {
  assert.equal(assignActionSub(resource({ category: "letters" })), "quick");
  assert.equal(assignActionSub(resource({ id: "controlai-legislators" })), "quick");
  assert.equal(assignActionSub(resource({ id: "donation-guide" })), "quick");
  assert.equal(assignActionSub(resource({ id: "some-new-action" })), "quick");
});

test("career and bigger commitments go to Go further", () => {
  assert.equal(assignActionSub(resource({ id: "80k-job-board" })), "further");
  assert.equal(assignActionSub(resource({ id: "mentor-others" })), "further");
  assert.equal(assignActionSub(resource({ id: "tabling" })), "further");
});

test("contact tools come first in their fixed order, whatever their scores", () => {
  const sorted = [
    resource({ id: "high-score", ev_general: 1, friction: 0.01 }),
    resource({ id: "callcongress", ev_general: 0.1, friction: 1 }),
    resource({ id: "low-score", ev_general: 0.1, friction: 1 }),
    resource({ id: "ifanyonebuildsit-act", ev_general: 0.1, friction: 1 }),
    resource({ id: "controlai-legislators", ev_general: 0.1, friction: 1 }),
  ].sort(sortActions);

  assert.deepEqual(
    sorted.map((r) => r.id),
    ["controlai-legislators", "ifanyonebuildsit-act", "callcongress", "high-score", "low-score"],
  );
});

test("the US contact tools are labeled in the seed list", () => {
  for (const id of ["ifanyonebuildsit-act", "callcongress"]) {
    const row = resources.find((r) => r.id === id);
    assert.ok(row, `${id} is missing`);
    assert.equal(row.location, "US only");
  }
});
