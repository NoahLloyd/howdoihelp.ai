import assert from "node:assert/strict";
import test from "node:test";

import { fetchResourcesWithOverrides } from "../src/lib/data";
import { resources as seed } from "../src/data/resources";

const visible = seed.filter((r) => r.enabled)[0];
const boosted = seed.filter((r) => r.enabled)[1];

test("without overrides, nothing changes", async () => {
  const resources = await fetchResourcesWithOverrides();
  assert.ok(resources.some((r) => r.id === visible.id));
});

test("hidden resources disappear and boosted resources score higher", async () => {
  const resources = await fetchResourcesWithOverrides({
    excluded_resources: [visible.id],
    boosted_resources: [boosted.id],
    resource_weights: {},
  });

  assert.equal(resources.find((r) => r.id === visible.id), undefined);
  assert.equal(
    resources.find((r) => r.id === boosted.id)?.ev_general,
    boosted.ev_general * 1.5,
  );
});
