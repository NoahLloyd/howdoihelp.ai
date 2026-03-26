/**
 * gather-eventbrite.ts - Searches Eventbrite for AI safety related events.
 *
 * Uses Eventbrite's public search endpoint (no API key needed for basic search).
 * Falls back to HTML scraping if the API response format changes.
 *
 * Usage:
 *   npx tsx scripts/gatherers/gather-eventbrite.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { insertCandidates, type GatheredEvent } from '../lib/insert-candidates';
import { preFilter } from '../lib/pre-filter';

const SEARCH_QUERIES = [
  'AI safety',
  'AI alignment',
  'existential risk AI',
  'AI governance',
  'effective altruism AI',
  'AI safety meetup',
  'AI alignment workshop',
];

const EVENTBRITE_SEARCH_URL = 'https://www.eventbrite.com/api/v3/destination/search/';

interface EventbriteEvent {
  id: string;
  name: string;
  url: string;
  summary?: string;
  start_date?: string;
  end_date?: string;
  primary_venue?: {
    name?: string;
    address?: {
      city?: string;
      region?: string;
      country?: string;
    };
  };
  is_online_event?: boolean;
  primary_organizer?: {
    name?: string;
  };
  image?: {
    url?: string;
  };
}

async function searchEventbrite(query: string): Promise<EventbriteEvent[]> {
  try {
    const res = await fetch(EVENTBRITE_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.eventbrite.com/',
      },
      body: JSON.stringify({
        event_search: {
          q: query,
          dates: 'current_future',
          page_size: 40,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      // Eventbrite may block automated requests; fall back to HTML scraping
      return await scrapeEventbriteSearch(query);
    }

    const json = await res.json();
    return (json.events?.results || []).map((e: any) => ({
      id: e.id,
      name: e.name,
      url: e.url,
      summary: e.summary,
      start_date: e.start_date,
      end_date: e.end_date,
      primary_venue: e.primary_venue,
      is_online_event: e.is_online_event,
      primary_organizer: e.primary_organizer,
    }));
  } catch (err: any) {
    console.error(`  API search failed for "${query}": ${err.message}. Trying HTML scrape...`);
    return await scrapeEventbriteSearch(query);
  }
}

async function scrapeEventbriteSearch(query: string): Promise<EventbriteEvent[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://www.eventbrite.com/d/online/${encodedQuery}/`;

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

    // Eventbrite embeds event data in window.__SERVER_DATA__
    const serverDataStart = html.indexOf('__SERVER_DATA__ = {');
    if (serverDataStart !== -1) {
      const jsonStart = html.indexOf('{', serverDataStart);
      if (jsonStart !== -1) {
        // Find the end of the JSON object by tracking brace depth
        let depth = 0;
        let inString = false;
        let escaped = false;
        let jsonEnd = -1;
        for (let i = jsonStart; i < html.length; i++) {
          const c = html[i];
          if (escaped) { escaped = false; continue; }
          if (c === '\\') { escaped = true; continue; }
          if (c === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (c === '{' || c === '[') depth++;
          if (c === '}' || c === ']') depth--;
          if (depth === 0) { jsonEnd = i + 1; break; }
        }

        if (jsonEnd !== -1) {
          try {
            const serverData = JSON.parse(html.substring(jsonStart, jsonEnd));
            const results = serverData?.search_data?.events?.results || [];
            if (results.length > 0) {
              return results.map((e: any) => ({
                id: String(e.id),
                name: e.name || '',
                url: e.url || '',
                summary: e.summary || e.description?.text || '',
                start_date: e.start_date || e.start?.local || '',
                end_date: e.end_date || e.end?.local || '',
                primary_venue: e.primary_venue,
                is_online_event: e.is_online_event,
                primary_organizer: e.primary_organizer,
              })).filter((e: EventbriteEvent) => e.id && e.url);
            }
          } catch {
            // JSON parse failed, fall through to URL extraction
          }
        }
      }
    }

    // Fallback: extract event URLs and try to get titles from URL slugs
    const events: EventbriteEvent[] = [];
    const seen = new Set<string>();
    const urlRegex = /href="(https:\/\/www\.eventbrite\.com\/e\/([^"?]+))[^"]*"/gi;

    let match;
    while ((match = urlRegex.exec(html)) !== null) {
      const eventUrl = match[1];
      const slug = match[2];
      if (seen.has(eventUrl)) continue;
      seen.add(eventUrl);

      const idMatch = eventUrl.match(/-(\d+)(?:\/)?$/);
      if (!idMatch) continue;

      // Extract a readable title from the URL slug
      const titleFromSlug = slug
        .replace(/-tickets-\d+\/?$/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

      events.push({
        id: idMatch[1],
        name: titleFromSlug,
        url: eventUrl,
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
    const results = await searchEventbrite(query);
    console.log(`  → ${results.length} results`);

    for (const e of results) {
      if (allEvents.has(e.id)) continue;

      let location = 'Online';
      if (e.primary_venue?.address) {
        const addr = e.primary_venue.address;
        const parts = [addr.city, addr.region, addr.country].filter(Boolean);
        if (parts.length > 0) location = parts.join(', ');
      } else if (!e.is_online_event) {
        location = 'Location TBD';
      }

      allEvents.set(e.id, {
        title: e.name || `Eventbrite Event ${e.id}`,
        description: e.summary || undefined,
        url: e.url,
        source: 'eventbrite',
        source_id: e.id,
        source_org: e.primary_organizer?.name || 'Eventbrite',
        location,
        event_date: e.start_date ? e.start_date.substring(0, 10) : undefined,
        event_end_date: e.end_date ? e.end_date.substring(0, 10) : undefined,
      });
    }

    // Rate limit between searches
    await new Promise((r) => setTimeout(r, 1000));
  }

  return Array.from(allEvents.values());
}

export async function run(opts: { dryRun?: boolean } = {}) {
  const { dryRun = false } = opts;
  console.log(`📡 Eventbrite Event Gatherer${dryRun ? ' (DRY RUN)' : ''}\n`);
  const events = await gather();
  console.log(`\n  ${events.length} unique events found.`);

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

if (process.argv[1]?.includes('/scripts/')) {
  run({ dryRun: process.argv.includes('--dry-run') }).catch((err) => {
    console.error('💥 Fatal:', err);
    process.exit(1);
  });
}
