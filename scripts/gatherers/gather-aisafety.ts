/**
 * gather-aisafety.ts - Fetches events from the AISafety.com Events & Training Airtable.
 *
 * AISafety.com maintains a curated Airtable of AI safety events:
 * https://airtable.com/appF8XfZUGXtfi40E/shrLgl03tMK4q6cyc/tblx0L8qJEaLBxJFS
 *
 * This gatherer:
 * 1. Fetches the shared view HTML to extract a signed API URL (includes access policy)
 * 2. Calls Airtable's internal API with that signed URL to get structured data
 * 3. Maps the rows to GatheredEvent format
 *
 * No API key needed - uses the public shared view.
 *
 * Usage:
 *   npx tsx scripts/gatherers/gather-aisafety.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { insertCandidates, type GatheredEvent } from '../lib/insert-candidates';
import { insertProgramCandidates, type GatheredProgram } from '../lib/insert-program-candidates';

const AIRTABLE_SHARE_URL = 'https://airtable.com/appF8XfZUGXtfi40E/shrLgl03tMK4q6cyc/tblx0L8qJEaLBxJFS';
const AIRTABLE_APP_ID = 'appF8XfZUGXtfi40E';

// Column IDs from the shared view schema
const COL = {
  NAME: 'fldqx8bjKAUc3IfVO',
  LINK: 'fldNxSWanmMW0l49y',
  START_DATE: 'fldRdvrU4kw7liuXt',
  END_DATE: 'fld9viXAgNWmLmcwO',
  DESCRIPTION: 'fldKQrII3tnj8K2xT',
  APPLICATIONS_CLOSE: 'fldiDBF0GlZkxepBx',
  TYPE: 'fldu75bm9xmXRJ9NU',
  LOCATION: 'fldK8ohHmfjK1N7dY',
} as const;

// Multi-select option mappings (ID → label)
const TYPE_MAP: Record<string, string> = {
  selsbdp9cn5KjNn7n: 'Bootcamp',
  selR36HLhuIWbpXgV: 'Competition',
  seldpsiSJGMPZQGmp: 'Conference',
  selIjFuGjEGTWwnYb: 'Course',
  selJQOMexawsUzvt7: 'Fellowship',
  selBGSVy1u9oR3wTc: 'Hackathon',
  seleg2jrxh5yUiGSz: 'Meetup',
  selM7Z1ysKPa3Da6m: 'Other',
  sel9dt5eD1hKAEoQL: 'Retreat',
  sel9vPtntPplXbSkz: 'Workshop',
};

// Types that belong in the programs pipeline (not events)
const PROGRAM_TYPES = new Set(['Bootcamp', 'Course', 'Fellowship']);

const PROGRAM_TYPE_TO_COURSE_TYPE: Record<string, string> = {
  Bootcamp: 'intensive',
  Course: 'self-paced',
  Fellowship: 'fellowship',
};

const LOCATION_MAP: Record<string, string> = {
  sel70PflnnxyZ12he: 'Online',
  selxRotifMOFbiqwc: 'Africa',
  sel5lwhFu586Tz4ch: 'Asia',
  selRVHbABMZpD21RQ: 'Australia/New Zealand',
  selR8CTHb9hYPenwl: 'Canada',
  selRK2KcSwmkACVlF: 'Europe',
  selgNCBxhKKNrGddJ: 'Latin America',
  selOYK0SjgKJQPLLt: 'UK',
  selXb5cm7gJuS2LSO: 'USA',
};

interface AirtableRow {
  id: string;
  cellValuesByColumnId: Record<string, any>;
}

/**
 * Fetch the shared view HTML page and extract the signed API URL.
 * Airtable embeds a fetch() call with a signed accessPolicy that grants
 * read access to the shared view data.
 */
async function getSignedApiUrl(): Promise<string | null> {
  const res = await fetch(AIRTABLE_SHARE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,*/*',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    console.error(`  Failed to fetch Airtable page: ${res.status}`);
    return null;
  }

  const html = await res.text();

  // Extract the fetch URL that includes the signed accessPolicy
  const match = html.match(/fetch\("(\\u002Fv0\.3\\u002Fview\\u002F[^"]+)"/);
  if (!match) {
    console.error('  Could not find signed API URL in Airtable page');
    return null;
  }

  // Unescape unicode sequences
  const apiPath = match[1].replace(/\\u002F/g, '/');
  return `https://airtable.com${apiPath}`;
}

/**
 * Fetch the actual table data using the signed API URL.
 */
async function fetchTableData(apiUrl: string): Promise<{ columns: any[]; rows: AirtableRow[] } | null> {
  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'x-airtable-application-id': AIRTABLE_APP_ID,
      'x-requested-with': 'XMLHttpRequest',
      'x-time-zone': 'America/New_York',
      'x-user-locale': 'en',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    console.error(`  Airtable API returned ${res.status}`);
    return null;
  }

  const json = await res.json();
  const table = json?.data?.table;

  if (!table?.rows) {
    console.error('  No table data in Airtable response');
    return null;
  }

  // Update column mappings from actual response if available
  if (table.columns) {
    for (const col of table.columns) {
      if (col.type === 'multiSelect' && col.typeOptions?.choices) {
        const choices = col.typeOptions.choices;
        const targetMap = col.id === COL.TYPE ? TYPE_MAP : col.id === COL.LOCATION ? LOCATION_MAP : null;
        if (targetMap) {
          for (const [id, choice] of Object.entries(choices) as [string, any][]) {
            if (choice.name && !targetMap[id]) {
              targetMap[id] = choice.name;
            }
          }
        }
      }
    }
  }

  return { columns: table.columns, rows: table.rows };
}

function resolveMultiSelect(ids: string[] | null | undefined, map: Record<string, string>): string[] {
  if (!ids || !Array.isArray(ids)) return [];
  return ids.map(id => map[id] || id).filter(Boolean);
}

export async function gather(mode: 'events' | 'programs' = 'events'): Promise<GatheredEvent[]> {
  console.log('  Fetching signed API URL from shared view...');
  const apiUrl = await getSignedApiUrl();
  if (!apiUrl) return [];

  console.log('  Fetching table data...');
  const data = await fetchTableData(apiUrl);
  if (!data) return [];

  console.log(`  → ${data.rows.length} rows in Airtable`);

  const events: GatheredEvent[] = [];

  for (const row of data.rows) {
    const cells = row.cellValuesByColumnId;

    const name = cells[COL.NAME];
    if (!name) continue;

    const linkField = cells[COL.LINK]; // { label: string, url: string }
    const url = linkField?.url;
    if (!url) continue;

    const startDate = cells[COL.START_DATE]; // ISO string
    const endDate = cells[COL.END_DATE];
    const description = cells[COL.DESCRIPTION];
    const types = resolveMultiSelect(cells[COL.TYPE], TYPE_MAP);
    const locations = resolveMultiSelect(cells[COL.LOCATION], LOCATION_MAP);

    // Filter based on mode: programs pipeline gets Bootcamp/Course/Fellowship,
    // events pipeline gets everything else
    const isProgram = types.some(t => PROGRAM_TYPES.has(t));
    if (mode === 'programs' && !isProgram) continue;
    if (mode === 'events' && isProgram) continue;

    const location = locations.length > 0 ? locations.join(', ') : 'Location TBD';

    events.push({
      title: name,
      description: description?.substring(0, 500) || undefined,
      url,
      source: 'aisafety',
      source_id: row.id,
      source_org: 'AISafety.com',
      location,
      event_date: startDate ? startDate.substring(0, 10) : undefined,
      event_end_date: endDate ? endDate.substring(0, 10) : undefined,
    });
  }

  return events;
}

export async function gatherPrograms(): Promise<GatheredProgram[]> {
  console.log('  Fetching signed API URL from shared view...');
  const apiUrl = await getSignedApiUrl();
  if (!apiUrl) return [];

  console.log('  Fetching table data...');
  const data = await fetchTableData(apiUrl);
  if (!data) return [];

  console.log(`  → ${data.rows.length} rows in Airtable`);

  const programs: GatheredProgram[] = [];

  for (const row of data.rows) {
    const cells = row.cellValuesByColumnId;

    const name = cells[COL.NAME];
    if (!name) continue;

    const linkField = cells[COL.LINK];
    const url = linkField?.url;
    if (!url) continue;

    const startDate = cells[COL.START_DATE];
    const endDate = cells[COL.END_DATE];
    const description = cells[COL.DESCRIPTION];
    const types = resolveMultiSelect(cells[COL.TYPE], TYPE_MAP);
    const locations = resolveMultiSelect(cells[COL.LOCATION], LOCATION_MAP);

    // Only include program types
    const programType = types.find(t => PROGRAM_TYPES.has(t));
    if (!programType) continue;

    const location = locations.length > 0 ? locations.join(', ') : 'Location TBD';

    programs.push({
      title: name,
      description: description?.substring(0, 500) || undefined,
      url,
      source: 'aisafety',
      source_id: row.id,
      source_org: 'AISafety.com',
      location,
      course_type: PROGRAM_TYPE_TO_COURSE_TYPE[programType] || 'self-paced',
      start_date: startDate ? startDate.substring(0, 10) : undefined,
      end_date: endDate ? endDate.substring(0, 10) : undefined,
    });
  }

  return programs;
}

// Exported run function for API route usage
export async function run(opts: { dryRun?: boolean; programs?: boolean } = {}) {
  const { dryRun = false, programs: programsMode = false } = opts;

  const modeLabel = programsMode ? 'Programs' : 'Events';
  console.log(`📡 AISafety.com Airtable Gatherer - ${modeLabel}${dryRun ? ' (DRY RUN)' : ''}\n`);

  if (programsMode) {
    const programs = await gatherPrograms();
    console.log(`\n  ${programs.length} programs extracted.`);

    if (dryRun) {
      for (const p of programs) {
        console.log(`  [${p.source}] ${p.course_type} | ${p.title} | ${p.location} | ${p.url}`);
      }
      console.log(`\n✅ Dry run complete. ${programs.length} programs would be inserted.`);
      return;
    }

    const result = await insertProgramCandidates(programs);
    console.log(`\n✅ Done: ${result.inserted} new candidates, ${result.skipped} skipped, ${result.errors} errors.`);
  } else {
    const events = await gather('events');
    console.log(`\n  ${events.length} events extracted.`);

    if (dryRun) {
      for (const e of events) {
        console.log(`  [${e.source}] ${e.event_date || 'no-date'} | ${e.title} | ${e.location} | ${e.url}`);
      }
      console.log(`\n✅ Dry run complete. ${events.length} events would be inserted.`);
      return;
    }

    const result = await insertCandidates(events);
    console.log(`\n✅ Done: ${result.inserted} new candidates, ${result.skipped} skipped, ${result.errors} errors.`);
  }
}

// CLI entrypoint - only runs when executed directly via tsx
if (process.argv[1]?.endsWith('/scripts/gatherers/gather-aisafety.ts')) {
  const dryRun = process.argv.includes('--dry-run');
  const programs = process.argv.includes('--programs');
  run({ dryRun, programs }).catch((err) => {
    console.error('💥 Fatal:', err);
    process.exit(1);
  });
}
