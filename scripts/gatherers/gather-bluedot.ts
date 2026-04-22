/**
 * gather-bluedot.ts - Fetches courses from BlueDot Impact's course hub.
 *
 * BlueDot Impact offers free AI safety courses with certificates:
 * https://bluedot.org/courses
 *
 * This gatherer:
 * 1. Calls BlueDot's public tRPC API to get all courses
 * 2. For each course displayed on the hub, fetches upcoming rounds (intensive + part-time)
 * 3. Creates one program candidate per course+round combination
 *
 * No API key needed - uses public tRPC endpoints.
 *
 * Usage:
 *   npx tsx scripts/gatherers/gather-bluedot.ts
 *   npx tsx scripts/gatherers/gather-bluedot.ts --dry-run
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { insertProgramCandidates, type GatheredProgram } from '../lib/insert-program-candidates';

const BLUEDOT_BASE = 'https://bluedot.org';
const COURSES_API = `${BLUEDOT_BASE}/api/trpc/courses.getAll?input=%7B%7D`;
const ROUNDS_API = (slug: string) =>
  `${BLUEDOT_BASE}/api/trpc/courseRounds.getRoundsForCourse?input=${encodeURIComponent(JSON.stringify({ courseSlug: slug }))}`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

interface BlueDotCourse {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  path: string;
  displayOnCourseHubIndex: boolean | null;
  durationHours: number | null;
  durationDescription: string | null;
  level: string | null;
  applyUrl: string | null;
}

interface BlueDotRound {
  id: string;
  intensity: string;
  applicationDeadline: string;
  applicationDeadlineRaw: string;
  firstDiscussionDateRaw: string;
  dateRange: string;
  numberOfUnits: number;
}

interface RoundsResponse {
  intense: BlueDotRound[];
  partTime: BlueDotRound[];
}

/**
 * Fetch all courses from BlueDot's tRPC API.
 */
async function fetchCourses(): Promise<BlueDotCourse[]> {
  console.log('  Fetching courses from BlueDot tRPC API...');

  const res = await fetch(COURSES_API, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    console.error(`  Failed to fetch courses: HTTP ${res.status}`);
    return [];
  }

  const json = await res.json();
  const courses: BlueDotCourse[] = json?.result?.data || [];

  // Filter to only courses displayed on the course hub
  const displayed = courses.filter(c => c.displayOnCourseHubIndex);
  console.log(`  → ${courses.length} total courses, ${displayed.length} displayed on hub`);

  return displayed;
}

/**
 * Fetch upcoming rounds for a specific course.
 */
async function fetchRounds(courseSlug: string): Promise<RoundsResponse> {
  const res = await fetch(ROUNDS_API(courseSlug), {
    headers: HEADERS,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    console.error(`  Failed to fetch rounds for ${courseSlug}: HTTP ${res.status}`);
    return { intense: [], partTime: [] };
  }

  const json = await res.json();
  return json?.result?.data || { intense: [], partTime: [] };
}

/**
 * Extract the start date from a round's firstDiscussionDateRaw field.
 */
function extractStartDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return new Date(raw).toISOString().split('T')[0];
  } catch {
    return undefined;
  }
}

/**
 * Build a duration description from course and round data.
 */
function buildDurationDescription(
  course: BlueDotCourse,
  round: BlueDotRound,
  type: 'intensive' | 'part-time',
): string {
  if (type === 'intensive') {
    return `${round.numberOfUnits} day intensive (5h/day)`;
  }
  if (course.durationDescription) {
    return course.durationDescription;
  }
  return `${round.numberOfUnits} week course (5h/week)`;
}

export async function gather(): Promise<GatheredProgram[]> {
  const courses = await fetchCourses();
  if (courses.length === 0) return [];

  const programs: GatheredProgram[] = [];

  for (const course of courses) {
    console.log(`  Fetching rounds for "${course.title}"...`);
    const rounds = await fetchRounds(course.slug);

    const intensiveCount = rounds.intense.length;
    const partTimeCount = rounds.partTime.length;

    // Create entries for intensive rounds
    for (const round of rounds.intense) {
      programs.push({
        title: `${course.title} (Intensive)`,
        description: course.shortDescription,
        url: `${BLUEDOT_BASE}${course.path}`,
        source: 'bluedot',
        source_id: `bluedot-${course.slug}-${round.id}`,
        source_org: 'BlueDot Impact',
        location: 'Online',
        course_type: 'intensive',
        duration_description: buildDurationDescription(course, round, 'intensive'),
        duration_hours: course.durationHours || undefined,
        application_deadline: round.applicationDeadlineRaw || undefined,
        start_date: extractStartDate(round.firstDiscussionDateRaw),
        date_range: round.dateRange,
      });
    }

    // Create entries for part-time rounds
    for (const round of rounds.partTime) {
      programs.push({
        title: `${course.title} (Part-time)`,
        description: course.shortDescription,
        url: `${BLUEDOT_BASE}${course.path}`,
        source: 'bluedot',
        source_id: `bluedot-${course.slug}-${round.id}`,
        source_org: 'BlueDot Impact',
        location: 'Online',
        course_type: 'part-time',
        duration_description: buildDurationDescription(course, round, 'part-time'),
        duration_hours: course.durationHours || undefined,
        application_deadline: round.applicationDeadlineRaw || undefined,
        start_date: extractStartDate(round.firstDiscussionDateRaw),
        date_range: round.dateRange,
      });
    }

    // If no rounds, still create one entry for the course itself (self-paced / future)
    if (intensiveCount === 0 && partTimeCount === 0) {
      programs.push({
        title: course.title,
        description: course.shortDescription,
        url: `${BLUEDOT_BASE}${course.path}`,
        source: 'bluedot',
        source_id: `bluedot-${course.slug}`,
        source_org: 'BlueDot Impact',
        location: 'Online',
        course_type: 'self-paced',
        duration_description: course.durationDescription || undefined,
        duration_hours: course.durationHours || undefined,
      });
    }

    console.log(`    → ${intensiveCount} intensive, ${partTimeCount} part-time rounds`);
  }

  return programs;
}

export async function run(opts: { dryRun?: boolean } = {}) {
  const { dryRun = false } = opts;
  console.log(`📡 BlueDot Impact Gatherer${dryRun ? ' (DRY RUN)' : ''}\n`);

  const programs = await gather();
  console.log(`\n  ${programs.length} program entries extracted.`);

  if (dryRun) {
    for (const p of programs) {
      console.log(`  [${p.source}] ${p.course_type} | ${p.title} | ${p.date_range || 'self-paced'} | deadline: ${p.application_deadline || 'none'}`);
    }
    console.log(`\n✅ Dry run complete. ${programs.length} programs would be inserted.`);
    return;
  }

  const result = await insertProgramCandidates(programs);
  console.log(`\n✅ Done: ${result.inserted} new candidates, ${result.skipped} skipped, ${result.errors} errors.`);
}

if (process.argv[1]?.endsWith('/scripts/gatherers/gather-bluedot.ts')) {
  run({ dryRun: process.argv.includes('--dry-run') }).catch((err) => {
    console.error('💥 Fatal:', err);
    process.exit(1);
  });
}
