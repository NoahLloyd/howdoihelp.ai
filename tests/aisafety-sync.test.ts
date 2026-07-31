import test from "node:test";
import assert from "node:assert/strict";
import {
  mapAisafetyRecord,
  planAisafetySync,
  validateAisafetyEnvelope,
  type AisafetyApiResponse,
  type AisafetyCollection,
  type ExistingResource,
} from "../scripts/lib/aisafety-api";
import { isResourceCurrent } from "../src/lib/resource-currentness";
import { stripInternalFields } from "../src/lib/api-helpers";
import type { Resource } from "../src/types";

const NOW = new Date("2026-07-30T12:00:00.000Z");

function envelope(collection: AisafetyCollection, data: Array<Record<string, unknown>>): AisafetyApiResponse {
  return validateAisafetyEnvelope(
    collection,
    { data, meta: { count: data.length } },
    { minimumCount: 0 },
  );
}

function existing(overrides: Partial<ExistingResource>): ExistingResource {
  return {
    id: "row",
    title: "Existing",
    description: "Existing",
    url: "https://example.com",
    source_org: "Existing",
    category: "events",
    location: "Global",
    enabled: true,
    status: "approved",
    ev_general: 0.4,
    ev_positioned: 0.5,
    friction: 0.2,
    min_minutes: 30,
    background_tags: ["preserved-bg"],
    position_tags: ["preserved-pos"],
    created_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("validates AISafety API envelopes defensively", () => {
  const valid = validateAisafetyEnvelope(
    "events",
    {
      data: [{ id: "evt_1", name: "Event", url: "https://events.example" }],
      meta: { count: 1 },
    },
    { minimumCount: 1 },
  );

  assert.equal(valid.data[0].id, "evt_1");
  assert.throws(
    () => validateAisafetyEnvelope("events", { data: [], meta: { count: 1 } }, { minimumCount: 0 }),
    /meta\.count/,
  );
  assert.throws(
    () =>
      validateAisafetyEnvelope(
        "communities",
        {
          data: [
            { id: "same", name: "One", joinLink: "https://one.example" },
            { id: "same", name: "Two", joinLink: "https://two.example" },
          ],
          meta: { count: 2 },
        },
        { minimumCount: 0 },
      ),
    /duplicate record id/,
  );
  assert.throws(
    () =>
      validateAisafetyEnvelope(
        "training",
        { data: [{ id: "course_1", name: "Course" }], meta: { count: 1 } },
        { minimumCount: 0 },
      ),
    /required url/,
  );
  assert.throws(
    () =>
      validateAisafetyEnvelope(
        "communities",
        { data: [{ id: "c1", name: "Community", joinLink: "https://community.example" }], meta: { count: 1 } },
        { minimumCount: 2 },
      ),
    /below the healthy minimum/,
  );
});

test("maps communities with source attribution, activity, and online location behavior", () => {
  const active = mapAisafetyRecord(
    "communities",
    {
      id: "comm_1",
      payload: {
        id: "comm_1",
        name: "AI Alignment Slack",
        joinLink: "https://slack.example",
        type: ["Online", "Slack"],
        activity: "Very active",
        focus: "Technical alignment",
      },
    },
    NOW,
  );

  assert.equal(active.row.source, "aisafety");
  assert.equal(active.row.source_id, "communities:comm_1");
  assert.equal(active.row.source_org, "AI Alignment Slack");
  assert.equal(active.row.location, "Online");
  assert.equal(active.row.is_online, true);
  assert.equal(active.row.activity_score, 1);
  assert.equal(active.row.enabled, true);
  assert.deepEqual(active.row.background_tags, ["technical"]);
  assert.deepEqual(active.row.position_tags, ["ai_tech"]);

  const inactive = mapAisafetyRecord(
    "communities",
    {
      id: "comm_2",
      payload: {
        id: "comm_2",
        name: "Dormant Group",
        joinLink: "https://dormant.example",
        location: "Berlin, Germany",
        activityLevel: "Inactive",
      },
    },
    NOW,
  );

  assert.equal(inactive.row.location, "Berlin, Germany");
  assert.equal(inactive.row.enabled, false);
  assert.equal(inactive.row.activity_score, 0);
});

test("accepts invite-only communities whose official join link is email", () => {
  const response = validateAisafetyEnvelope(
    "communities",
    {
      data: [
        {
          id: "community_email",
          name: "Invite-only group",
          joinLink: "mailto:organizer@example.org",
          type: ["Online"],
          activityLevel: "Active",
        },
      ],
      meta: { count: 1 },
    },
    { minimumCount: 1 },
  );

  const mapped = mapAisafetyRecord("communities", response.data[0], NOW);
  assert.equal(mapped.row.url, "mailto:organizer@example.org");
  assert.equal(mapped.row.enabled, true);
});

test("keeps placeholder-link communities mirrored but disabled", () => {
  const response = validateAisafetyEnvelope(
    "communities",
    {
      data: [
        {
          id: "community_placeholder",
          name: "Private invite-only group",
          joinLink: "#",
          type: ["Online"],
          activityLevel: "Active",
        },
      ],
      meta: { count: 1 },
    },
    { minimumCount: 1 },
  );

  const mapped = mapAisafetyRecord("communities", response.data[0], NOW);
  assert.equal(mapped.row.url, "https://aisafety.com/communities");
  assert.equal(mapped.row.enabled, false);
  assert.match(mapped.row.verification_notes || "", /no actionable join link/);
});

test("maps events without hiding ongoing events due to past start or deadline", () => {
  const ongoing = mapAisafetyRecord(
    "events",
    {
      id: "evt_1",
      payload: {
        id: "evt_1",
        title: "Three Day Conference",
        url: "https://events.example/three-day",
        startDate: "2026-07-29",
        endDate: "2026-07-31",
        applicationsClose: "2026-07-01",
        type: ["Conference"],
        mode: ["In person"],
        location: "New York, USA",
      },
    },
    NOW,
  );

  assert.equal(ongoing.row.enabled, true);
  assert.equal(ongoing.row.deadline_date, "2026-07-01");
  assert.equal(ongoing.row.event_date, "2026-07-29");
  assert.equal(ongoing.row.event_end_date, "2026-07-31");
  assert.equal(ongoing.row.source_org, "AISafety.com");
  assert.equal(ongoing.row.min_minutes, 1440);

  const past = mapAisafetyRecord(
    "events",
    {
      id: "evt_2",
      payload: {
        id: "evt_2",
        name: "Past Workshop",
        url: "https://events.example/past",
        startDate: "2026-07-01",
        endDate: "2026-07-02",
      },
    },
    NOW,
  );

  assert.equal(past.row.enabled, false);
  assert.equal(past.row.activity_score, 0);
});

test("maps training recurring and scheduled records deterministically", () => {
  const recurring = mapAisafetyRecord(
    "training",
    {
      id: "train_1",
      payload: {
        id: "train_1",
        name: "Self-paced Governance Course",
        url: "https://training.example/course",
        recurring: true,
        startDate: "2026-01-01",
        applicationsClose: "2026-01-01",
        type: ["Course"],
        focus: ["Governance", "Policy"],
        timeCommitment: "10 hours/week for 8 weeks",
      },
    },
    NOW,
  );

  assert.equal(recurring.row.category, "programs");
  assert.equal(recurring.row.enabled, true);
  assert.equal(recurring.row.event_date, null);
  assert.equal(recurring.row.deadline_date, null);
  assert.equal(recurring.row.min_minutes, 4800);
  assert.deepEqual(recurring.row.background_tags, ["policy"]);
  assert.deepEqual(recurring.row.position_tags, ["policy_gov"]);

  const closed = mapAisafetyRecord(
    "training",
    {
      id: "train_2",
      payload: {
        id: "train_2",
        name: "Closed Fellowship",
        url: "https://training.example/fellowship",
        applicationStatus: "Closed",
        startDate: "2026-08-01",
        endDate: "2026-08-30",
        type: ["Fellowship"],
      },
    },
    NOW,
  );

  assert.equal(closed.row.enabled, false);
});

test("shared currentness keeps ongoing events and expires stale programs", () => {
  assert.equal(
    isResourceCurrent(
      {
        category: "events",
        event_date: "2026-07-29",
        event_end_date: "2026-07-31",
        deadline_date: "2026-07-01",
      },
      NOW,
    ),
    true,
  );
  assert.equal(
    isResourceCurrent({ category: "events", event_date: "2026-07-01", event_end_date: "2026-07-02" }, NOW),
    false,
  );
  assert.equal(
    isResourceCurrent({ category: "programs", deadline_date: "2026-07-01", event_date: undefined }, NOW),
    false,
  );
  assert.equal(isResourceCurrent({ category: "programs" }, NOW), true);
});

test("planning matches safely and never takes over manual rows", () => {
  const responses = [
    envelope("communities", [
      { id: "comm_1", name: "Legacy AISafety Community", joinLink: "https://legacy.example" },
      { id: "comm_2", name: "Manual Protected", joinLink: "https://manual.example" },
    ]),
    envelope("training", [
      { id: "train_a", name: "Shared URL A", url: "https://shared.example", recurring: true },
      { id: "train_b", name: "Shared URL B", url: "https://shared.example", recurring: true },
    ]),
  ];
  const existingRows = [
    existing({
      id: "legacy-row",
      title: "Legacy AISafety Community",
      url: "https://legacy.example",
      category: "communities",
      source: "aisafety",
      source_id: "comm_1",
    }),
    existing({
      id: "manual-row",
      title: "Manual Protected",
      url: "https://manual.example",
      category: "communities",
      source: "manual",
      source_id: "manual-1",
    }),
    existing({
      id: "shared-row",
      title: "Shared URL A",
      url: "https://shared.example",
      category: "programs",
      source: "bluedot",
      source_id: "shared-a",
    }),
  ];

  const plan = planAisafetySync({
    collections: ["communities", "training"],
    responses,
    existingResources: existingRows,
    now: NOW,
  });

  const legacy = plan.seen.find((row) => row.mapped.record.id === "comm_1")!;
  const manualProtected = plan.seen.find((row) => row.mapped.record.id === "comm_2")!;
  const sharedA = plan.seen.find((row) => row.mapped.record.id === "train_a")!;
  const sharedB = plan.seen.find((row) => row.mapped.record.id === "train_b")!;

  assert.equal(legacy.row.id, "legacy-row");
  assert.equal(legacy.matchReason, "legacy-aisafety-record-id");
  assert.equal(legacy.row.ev_general, 0.4);
  assert.deepEqual(legacy.row.background_tags, ["preserved-bg"]);
  assert.equal(legacy.takeover, true);

  assert.notEqual(manualProtected.row.id, "manual-row");
  assert.equal(manualProtected.existing, undefined);

  assert.equal(sharedA.row.id, "shared-row");
  assert.notEqual(sharedB.row.id, "shared-row");
  assert.equal(new Set(plan.seen.map((row) => row.row.id)).size, plan.seen.length);
});

test("planning increments missing counts and disables only on second healthy miss", () => {
  const responses = [envelope("events", [{ id: "evt_seen", name: "Seen", url: "https://seen.example" }])];
  const firstMiss = planAisafetySync({
    collections: ["events"],
    responses,
    existingResources: [
      existing({
        id: "missing-once",
        category: "events",
        source: "aisafety",
        source_id: "events:old",
        upstream_managed: true,
        upstream_collection: "events",
        upstream_missing_count: 0,
      }),
    ],
    now: NOW,
  });

  assert.equal(firstMiss.summary.missing, 1);
  assert.equal(firstMiss.summary.disabledMissing, 0);
  assert.equal(firstMiss.missing[0].nextMissingCount, 1);
  assert.equal(firstMiss.missing[0].update.enabled, undefined);

  const secondMiss = planAisafetySync({
    collections: ["events"],
    responses,
    existingResources: [
      existing({
        id: "missing-twice",
        category: "events",
        source: "aisafety",
        source_id: "events:old",
        upstream_managed: true,
        upstream_collection: "events",
        upstream_missing_count: 1,
      }),
    ],
    now: NOW,
  });

  assert.equal(secondMiss.summary.missing, 1);
  assert.equal(secondMiss.summary.disabledMissing, 1);
  assert.equal(secondMiss.missing[0].nextMissingCount, 2);
  assert.equal(secondMiss.missing[0].update.enabled, false);
});

test("planning counts duplicate same-day cron misses only once", () => {
  const responses = [envelope("events", [{ id: "evt_seen", name: "Seen", url: "https://seen.example" }])];
  const duplicateMiss = planAisafetySync({
    collections: ["events"],
    responses,
    existingResources: [
      existing({
        id: "missing-duplicate",
        category: "events",
        source: "aisafety",
        source_id: "events:old",
        upstream_managed: true,
        upstream_collection: "events",
        upstream_missing_count: 1,
        verified_at: "2026-07-30T06:10:00.000Z",
      }),
    ],
    now: NOW,
  });

  assert.equal(duplicateMiss.summary.disabledMissing, 0);
  assert.equal(duplicateMiss.missing[0].nextMissingCount, 1);
  assert.equal(duplicateMiss.missing[0].update.enabled, undefined);
  assert.equal(duplicateMiss.missing[0].update.verified_at, NOW.toISOString());
});

test("legacy retirement does not bypass the grace period for mirrored rows", () => {
  const plan = planAisafetySync({
    collections: ["events"],
    responses: [envelope("events", [{ id: "evt_seen", name: "Seen", url: "https://seen.example" }])],
    existingResources: [
      existing({
        id: "managed-missing",
        category: "events",
        source: "aisafety",
        source_id: "events:old",
        upstream_managed: true,
        upstream_collection: "events",
        upstream_missing_count: 0,
      }),
    ],
    retireLegacy: true,
    now: NOW,
  });

  assert.equal(plan.missing.length, 1);
  assert.equal(plan.missing[0].nextMissingCount, 1);
  assert.equal(plan.retirements.length, 0);
});

test("public API stripping hides internal mirror bookkeeping", () => {
  const resource = {
    id: "public-row",
    title: "Existing",
    description: "Existing description",
    url: "https://example.com",
    source_org: "Example",
    category: "events",
    location: "Online",
    created_at: "2025-01-01T00:00:00.000Z",
    min_minutes: 30,
    ev_general: 0.5,
    friction: 0.2,
    enabled: true,
    status: "approved",
    upstream_managed: true,
    upstream_collection: "events",
    upstream_last_seen_at: NOW.toISOString(),
    upstream_missing_count: 0,
    upstream_payload_hash: "secret-internal-hash",
  } satisfies Resource;
  const clean = stripInternalFields(resource);

  assert.equal(clean.upstream_managed, undefined);
  assert.equal(clean.upstream_last_seen_at, undefined);
  assert.equal(clean.upstream_missing_count, undefined);
  assert.equal(clean.upstream_payload_hash, undefined);
  assert.equal(clean.title, "Existing");
});
