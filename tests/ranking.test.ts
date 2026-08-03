import assert from "node:assert/strict";
import test from "node:test";

import { rankResources, scoreResource } from "../src/lib/ranking";
import type { GeoData, Resource, UserAnswers } from "../src/types";

const geo: GeoData = {
  city: "San Francisco",
  region: "California",
  country: "United States",
  countryCode: "US",
};

const intensiveProgram: Resource = {
  id: "intensive-program",
  title: "Technical founder accelerator",
  description: "A three-month, full-time accelerator for technical founders.",
  url: "https://example.com/program",
  source_org: "Example Lab",
  category: "programs",
  location: "San Francisco, USA",
  min_minutes: 28_800,
  ev_general: 0.6,
  friction: 0.85,
  enabled: true,
  status: "approved",
  created_at: "2026-01-01T00:00:00.000Z",
  background_tags: ["technical"],
  position_tags: ["ai_tech"],
  activity_score: 0.5,
};

test("activity scores do not penalize programs", () => {
  const answers: UserAnswers = { time: "significant" };
  const withAdminDefault = scoreResource(intensiveProgram, answers, geo, "A");
  const withoutActivityScore = scoreResource(
    { ...intensiveProgram, activity_score: undefined },
    answers,
    geo,
    "A",
  );

  assert.equal(withAdminDefault.score, withoutActivityScore.score);
});

test("intensive programs are excluded for short commitments but rank for matching users", () => {
  const shortCommitment: UserAnswers = { time: "hours" };
  const technicalCommitment: UserAnswers = {
    time: "significant",
    positioned: true,
    positionType: "ai_tech",
  };

  assert.deepEqual(
    rankResources([intensiveProgram], shortCommitment, geo, "A"),
    [],
  );

  const ranked = rankResources(
    [intensiveProgram],
    technicalCommitment,
    geo,
    "A",
  );
  assert.equal(ranked[0]?.resource.id, intensiveProgram.id);
  assert.ok(ranked[0].score > 1);
});
