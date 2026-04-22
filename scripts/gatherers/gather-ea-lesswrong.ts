/**
 * gather-ea-lesswrong.ts - Fetches upcoming events from EA Forum and LessWrong.
 *
 * Refactored from the original sync-events.ts. Instead of inserting directly
 * into resources, dumps raw candidates into event_candidates for evaluation.
 *
 * Usage:
 *   npx tsx scripts/gatherers/gather-ea-lesswrong.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as https from 'https';
import { insertCandidates, type GatheredEvent } from '../lib/insert-candidates';

const GRAPHQL_QUERY = `
query multiPostQuery($input: MultiPostInput) {
  posts(input: $input) {
    results {
      _id
      title
      url
      location
      onlineEvent
      globalEvent
      startTime
      endTime
      isEvent
      contents {
        plaintextDescription
      }
    }
  }
}
`;

function fetchGraphQL(hostname: string, view: string): Promise<any[]> {
  const variables = {
    input: {
      terms: {
        view,
        isEvent: true,
        limit: 200,
        lat: 0,
        lng: 0,
        distance: 50000,
      },
    },
  };

  const payload = JSON.stringify({ query: GRAPHQL_QUERY, variables });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.errors) {
              console.error('  GraphQL errors from', hostname, parsed.errors);
              resolve([]);
            } else {
              resolve(parsed.data?.posts?.results || []);
            }
          } catch {
            console.error('  Error parsing JSON from', hostname);
            resolve([]);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const SOURCES = [
  { name: 'EA Forum', key: 'ea-forum', hostname: 'forum.effectivealtruism.org' },
  { name: 'LessWrong', key: 'lesswrong', hostname: 'www.lesswrong.com' },
];

export async function gather(): Promise<GatheredEvent[]> {
  const events: GatheredEvent[] = [];

  for (const source of SOURCES) {
    console.log(`  Fetching from ${source.name}...`);
    const raw = await fetchGraphQL(source.hostname, 'nearbyEvents');
    console.log(`  → ${raw.length} events from ${source.name}`);

    for (const r of raw) {
      if (!r.title || !r.startTime) continue;

      let url = r.url;
      if (!url) {
        url = `https://${source.hostname}/events/${r._id}`;
      }

      let location = r.location || '';
      if (r.onlineEvent && !location) location = 'Online';
      if (r.globalEvent && !location) location = 'Global';
      if (!location) location = 'Location TBD';

      events.push({
        title: r.title,
        description: r.contents?.plaintextDescription?.slice(0, 500) || undefined,
        url,
        source: source.key,
        source_id: r._id,
        source_org: source.name,
        location,
        event_date: r.startTime ? r.startTime.substring(0, 10) : undefined,
        event_end_date: r.endTime ? r.endTime.substring(0, 10) : undefined,
      });
    }
  }

  return events;
}

export async function run(opts: { dryRun?: boolean } = {}) {
  const { dryRun = false } = opts;
  console.log(`📡 EA Forum + LessWrong Event Gatherer${dryRun ? ' (DRY RUN)' : ''}\n`);
  const events = await gather();

  // Deduplicate by source_id
  const unique = new Map<string, GatheredEvent>();
  for (const e of events) {
    const key = `${e.source}:${e.source_id}`;
    if (!unique.has(key)) unique.set(key, e);
  }
  const deduped = Array.from(unique.values());
  console.log(`\n  ${deduped.length} unique events extracted.`);

  if (dryRun) {
    for (const e of deduped) {
      console.log(`  [${e.source}] ${e.event_date || 'no-date'} | ${e.title} | ${e.location} | ${e.url}`);
    }
    console.log(`\n✅ Dry run complete. ${deduped.length} events would be inserted.`);
    return;
  }

  const result = await insertCandidates(deduped);
  console.log(`\n✅ Done: ${result.inserted} new candidates, ${result.skipped} skipped (already exist), ${result.errors} errors.`);
}

if (process.argv[1]?.endsWith('/scripts/gatherers/gather-ea-lesswrong.ts')) {
  run({ dryRun: process.argv.includes('--dry-run') }).catch((err) => {
    console.error('💥 Fatal:', err);
    process.exit(1);
  });
}
