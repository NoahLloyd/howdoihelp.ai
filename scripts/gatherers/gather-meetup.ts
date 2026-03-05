/**
 * gather-meetup.ts - Searches Meetup.com for AI safety related events.
 *
 * Uses Meetup's public GraphQL API (no auth needed for search).
 *
 * Usage:
 *   npx tsx scripts/gatherers/gather-meetup.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { insertCandidates, type GatheredEvent } from '../lib/insert-candidates';
import { preFilter } from '../lib/pre-filter';

const SEARCH_QUERIES = [
  'AI safety',
  'AI alignment',
  'existential risk',
  'effective altruism',
  'AI governance',
  'AI ethics meetup',
  'machine learning safety',
];

const MEETUP_GQL_URL = 'https://www.meetup.com/gql';

const SEARCH_QUERY = `
query($query: String!, $first: Int) {
  keywordSearch(input: { query: $query, first: $first, source: EVENTS }) {
    edges {
      node {
        id
        result {
          ... on Event {
            id
            title
            description
            eventUrl
            dateTime
            endTime
            venue {
              name
              city
              state
              country
            }
            isOnline
            group {
              name
              urlname
            }
          }
        }
      }
    }
  }
}
`;

interface MeetupEvent {
  id: string;
  title: string;
  description?: string;
  eventUrl: string;
  dateTime?: string;
  endTime?: string;
  venue?: {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  isOnline?: boolean;
  group?: {
    name?: string;
    urlname?: string;
  };
}

async function searchMeetup(query: string): Promise<MeetupEvent[]> {
  try {
    const res = await fetch(MEETUP_GQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: { query, first: 30 },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error(`  Meetup API returned ${res.status} for "${query}"`);
      return await scrapeMeetupSearch(query);
    }

    const json = await res.json();

    if (json.errors) {
      console.error(`  Meetup GQL errors for "${query}":`, json.errors[0]?.message);
      return await scrapeMeetupSearch(query);
    }

    const edges = json.data?.keywordSearch?.edges || [];
    return edges
      .map((edge: any) => edge.node?.result)
      .filter((e: any) => e && e.title && e.eventUrl);
  } catch (err: any) {
    console.error(`  Meetup search failed for "${query}": ${err.message}`);
    return await scrapeMeetupSearch(query);
  }
}

async function scrapeMeetupSearch(query: string): Promise<MeetupEvent[]> {
  try {
    const url = `https://www.meetup.com/find/?keywords=${encodeURIComponent(query)}&source=EVENTS`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return [];
    const html = await res.text();

    const events: MeetupEvent[] = [];
    const seen = new Set<string>();

    // Strategy 1: Extract Apollo cache / __NEXT_DATA__ JSON
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>({.+?})<\/script>/s);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        // Navigate through the Apollo cache to find Event objects
        const apolloState = nextData?.props?.pageProps?.__APOLLO_STATE__ || {};
        for (const [key, value] of Object.entries(apolloState)) {
          if (!key.startsWith('Event:')) continue;
          const e = value as any;
          if (!e.title || !e.eventUrl) continue;
          const eventUrl = e.eventUrl.startsWith('http') ? e.eventUrl : `https://www.meetup.com${e.eventUrl}`;
          const idMatch = eventUrl.match(/events\/(\d+)/);
          if (!idMatch || seen.has(idMatch[1])) continue;
          seen.add(idMatch[1]);

          events.push({
            id: idMatch[1],
            title: e.title,
            eventUrl,
            dateTime: e.dateTime,
            endTime: e.endTime,
            venue: e.venue ? {
              name: e.venue.name,
              city: e.venue.city,
              state: e.venue.state,
              country: e.venue.country,
            } : undefined,
            isOnline: e.eventType === 'ONLINE',
            group: e.group ? {
              name: e.group.name,
              urlname: e.group.urlname,
            } : undefined,
          });
        }
        if (events.length > 0) return events;
      } catch {
        // JSON parse failed, try other strategies
      }
    }

    // Strategy 2: Extract JSON-LD structured data
    const jsonLdRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    let jsonLdMatch;
    while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
      try {
        const ld = JSON.parse(jsonLdMatch[1]);
        const items = Array.isArray(ld) ? ld : [ld];
        for (const item of items) {
          if (item['@type'] !== 'Event') continue;
          const eventUrl = item.url || '';
          const idMatch = eventUrl.match(/events\/(\d+)/);
          if (!idMatch || seen.has(idMatch[1])) continue;
          seen.add(idMatch[1]);

          events.push({
            id: idMatch[1],
            title: item.name || '',
            eventUrl,
            dateTime: item.startDate,
            endTime: item.endDate,
            venue: item.location ? {
              name: item.location.name,
              city: item.location.address?.addressLocality,
              state: item.location.address?.addressRegion,
              country: item.location.address?.addressCountry,
            } : undefined,
            isOnline: item.eventAttendanceMode?.includes('Online'),
            group: item.organizer ? {
              name: item.organizer.name,
            } : undefined,
          });
        }
        if (events.length > 0) return events;
      } catch {
        continue;
      }
    }

    // Strategy 3: Fallback - extract event URLs and parse titles from slugs
    const urlRegex = /href="(https:\/\/www\.meetup\.com\/([^\/]+)\/events\/(\d+)[^"]*)"/gi;
    let match;
    while ((match = urlRegex.exec(html)) !== null) {
      const eventUrl = match[1].split('?')[0];
      const groupSlug = match[2];
      const eventId = match[3];
      if (seen.has(eventId)) continue;
      seen.add(eventId);

      // Convert group slug to a readable name
      const groupName = groupSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      events.push({
        id: eventId,
        title: '', // Will be filled by evaluator
        eventUrl,
        group: { name: groupName, urlname: groupSlug },
      });
    }

    return events;
  } catch {
    return [];
  }
}

export async function gather(): Promise<GatheredEvent[]> {
  const allEvents = new Map<string, GatheredEvent>();

  for (const query of SEARCH_QUERIES) {
    console.log(`  Searching: "${query}"...`);
    const results = await searchMeetup(query);
    console.log(`  → ${results.length} results`);

    for (const e of results) {
      const eventId = e.id || e.eventUrl.match(/events\/(\d+)/)?.[1] || '';
      if (!eventId || allEvents.has(eventId)) continue;

      let location = 'Online';
      if (e.venue) {
        const parts = [e.venue.city, e.venue.state, e.venue.country].filter(Boolean);
        if (parts.length > 0) location = parts.join(', ');
      } else if (e.isOnline === false) {
        location = 'Location TBD';
      }

      allEvents.set(eventId, {
        title: e.title || `Meetup Event ${eventId}`,
        description: e.description?.substring(0, 500) || undefined,
        url: e.eventUrl,
        source: 'meetup',
        source_id: eventId,
        source_org: e.group?.name || 'Meetup',
        location,
        event_date: e.dateTime ? new Date(e.dateTime).toISOString().substring(0, 10) : undefined,
        event_end_date: e.endTime ? new Date(e.endTime).toISOString().substring(0, 10) : undefined,
      });
    }

    // Rate limit between searches
    await new Promise((r) => setTimeout(r, 1500));
  }

  return Array.from(allEvents.values());
}

// CLI entrypoint
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`📡 Meetup.com Event Gatherer${dryRun ? ' (DRY RUN)' : ''}\n`);
  const events = await gather();
  console.log(`\n  ${events.length} unique events found.`);

  // Pre-filter obvious junk
  const { kept, rejected } = preFilter(events);
  if (rejected.length > 0) {
    console.log(`\n🚫 Pre-filter rejected ${rejected.length} irrelevant events:`);
    for (const r of rejected) {
      console.log(`   ✗ "${r.event.title}" - ${r.reason}`);
    }
  }
  console.log(`\n  ${kept.length} events passed pre-filter (${rejected.length} rejected).`);

  if (dryRun) {
    for (const e of kept) {
      console.log(`  [${e.source}] ${e.event_date || 'no-date'} | ${e.title} | ${e.location} | ${e.url}`);
    }
    console.log(`\n✅ Dry run complete. ${kept.length} events would be inserted.`);
    return;
  }

  const result = await insertCandidates(kept);
  console.log(`\n✅ Done: ${result.inserted} new candidates, ${result.skipped} skipped, ${result.errors} errors.`);
}

main().catch((err) => {
  console.error('💥 Fatal:', err);
  process.exit(1);
});
