import assert from "node:assert/strict";
import test from "node:test";

import { assignActionSub, isAvailableTo } from "../src/lib/browse-actions";
import { resources } from "../src/data/resources";
import type { GeoData, Resource } from "../src/types";

const belgium: GeoData = { country: "Belgium", countryCode: "BE", city: "Brussels", region: "Brussels Capital" };
const us: GeoData = { country: "United States", countryCode: "US", city: "Houston", region: "Texas" };
const uk: GeoData = { country: "United Kingdom", countryCode: "GB", city: "London", region: "England" };

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

test("cards for everywhere show in every country, and when the location is unknown", () => {
  for (const location of ["Global", "Online", ""]) {
    assert.equal(isAvailableTo(resource({ location }), belgium), true);
  }
  assert.equal(isAvailableTo(resource({ location: "US only" }), null), true);
  assert.equal(isAvailableTo(resource({ location: "US only" }), { country: "Unknown", countryCode: "XX" }), true);
});

test("a US-only card shows in the US and hides in Belgium", () => {
  const card = resource({ location: "US only" });
  assert.equal(isAvailableTo(card, us), true);
  assert.equal(isAvailableTo(card, belgium), false);
});

test("country codes match whole words only, and UK matches Great Britain", () => {
  const boston: GeoData = { country: "United States", countryCode: "US", city: "Boston", region: "Massachusetts" };
  assert.equal(isAvailableTo(resource({ location: "Houston" }), boston), false);
  assert.equal(isAvailableTo(resource({ location: "Belgium, BE" }), us), false);
  assert.equal(isAvailableTo(resource({ location: "UK only" }), uk), true);
  assert.equal(isAvailableTo(resource({ location: "Brussels, Belgium" }), belgium), true);
});

test("the US contact tools are labeled in the seed list", () => {
  for (const id of ["ifanyonebuildsit-act", "callcongress"]) {
    const row = resources.find((r) => r.id === id);
    assert.ok(row, `${id} is missing`);
    assert.equal(row.location, "US only");
  }
});
