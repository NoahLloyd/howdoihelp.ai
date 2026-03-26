/**
 * gather-luma.ts - Searches Luma for AI safety related events.
 *
 * Luma (luma.com, formerly lu.ma) hosts many EA/AI safety events. This gatherer:
 * 1. Searches known AI safety organizer calendars via API
 * 2. Searches Luma's discover page for relevant keywords
 * 3. Falls back to scraping individual event pages for metadata
 *
 * Usage:
 *   npx tsx scripts/gatherers/gather-luma.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { insertCandidates, type GatheredEvent } from '../lib/insert-candidates';
import { preFilter } from '../lib/pre-filter';

// Known AI safety / EA organizer calendars on Luma
const KNOWN_CALENDARS = [
  'aisafety',
  'alignmentjam',
  'eag',
  'ea-london',
  'ea-nyc',
  'ea-sf',
  'pause-ai',
  'apartresearch',
  'mats-program',
];

const SEARCH_QUERIES = [
  'AI safety',
  'AI alignment',
  'existential risk',
  'effective altruism',
  'AI governance',
];

// Both old and new Luma API base URLs
const LUMA_API_BASES = [
  'https://api.lu.ma',
  'https://api.luma.com',
];

interface LumaEvent {
  api_id: string;
  name: string;
  url: string;
  description?: string;
  start_at?: string;
  end_at?: string;
  geo_address_info?: {
    city?: string;
    region?: string;
    country?: string;
    full_address?: string;
  };
  timezone?: string;
  is_online?: boolean;
  cover_url?: string;
}

async function tryFetch(url: string, opts: RequestInit): Promise<Response | null> {
  try {
    const res = await fetch(url, opts);
    if (res.ok) return res;
    return null;
  } catch {
    return null;
  }
}

function parseLumaEventEntry(entry: any): LumaEvent {
  const e = entry.event || entry;
  const slug = e.url || e.api_id || '';
  const geo = e.geo_address_info;
  return {
    api_id: e.api_id || slug,
    name: e.name || '',
    url: `https://lu.ma/${slug}`,
    description: e.description?.substring(0, 500),
    start_at: e.start_at || entry.start_at,
    end_at: e.end_at,
    geo_address_info: geo ? {
      city: geo.city,
      region: geo.region || geo.city_state,
      country: geo.country,
      full_address: geo.full_address || geo.address,
    } : undefined,
    is_online: e.location_type === 'online' || !geo,
  };
}

async function fetchLumaCalendar(slug: string): Promise<LumaEvent[]> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
  };

  for (const base of LUMA_API_BASES) {
    const res = await tryFetch(`${base}/calendar/get-items?calendar_api_id=${slug}&period=future`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res) continue;
    try {
      const json = await res.json();
      const entries = json.entries || [];
      if (entries.length > 0) {
        return entries.map(parseLumaEventEntry).filter((e: LumaEvent) => e.api_id && e.name);
      }
    } catch {
      continue;
    }
  }

  // Fallback: try to scrape the calendar page directly
  return await scrapeLumaCalendarPage(slug);
}

async function scrapeLumaCalendarPage(slug: string): Promise<LumaEvent[]> {
  // Try both old and new domains
  for (const domain of ['lu.ma', 'luma.com']) {
    try {
      const res = await fetch(`https://${domain}/${slug}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,*/*',
        },
        signal: AbortSignal.timeout(10_000),
        redirect: 'follow',
      });

      if (!res.ok) continue;
      const html = await res.text();
      return extractEventsFromLumaHtml(html);
    } catch {
      continue;
    }
  }
  return [];
}

function extractEventsFromLumaHtml(html: string): LumaEvent[] {
  const events: LumaEvent[] = [];
  const seen = new Set<string>();

  // Strategy 1: Look for __NEXT_DATA__ or similar JSON payloads
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>({.+?})<\/script>/s);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      const props = data?.props?.pageProps || {};

      // Look for events in various possible locations
      const eventArrays = [
        props.initialData?.entries,
        props.entries,
        props.events,
        props.futureEvents,
      ].filter(Boolean);

      for (const arr of eventArrays) {
        for (const entry of arr) {
          const e = parseLumaEventEntry(entry);
          if (e.api_id && !seen.has(e.api_id)) {
            seen.add(e.api_id);
            events.push(e);
          }
        }
      }
      if (events.length > 0) return events;
    } catch {
      // Fall through
    }
  }

  // Strategy 2: Look for JSON-LD structured data
  const jsonLdRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
  let jsonLdMatch;
  while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        if (item['@type'] !== 'Event') continue;
        const eventUrl = item.url || '';
        const slug = eventUrl.replace(/^https?:\/\/(lu\.ma|luma\.com)\//, '');
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);

        events.push({
          api_id: slug,
          name: item.name || '',
          url: eventUrl.startsWith('http') ? eventUrl : `https://lu.ma/${slug}`,
          description: item.description?.substring(0, 500),
          start_at: item.startDate,
          end_at: item.endDate,
          geo_address_info: item.location?.address ? {
            city: item.location.address.addressLocality,
            region: item.location.address.addressRegion,
            country: item.location.address.addressCountry,
          } : undefined,
          is_online: item.eventAttendanceMode?.includes('Online'),
        });
      }
    } catch {
      continue;
    }
  }

  // Strategy 3: Extract event slugs from href attributes (least reliable)
  if (events.length === 0) {
    // Look for event API IDs in the HTML (format: evt-XXXXX or short slugs)
    const apiIdRegex = /"api_id"\s*:\s*"(evt-[A-Za-z0-9]+)"/g;
    let match;
    while ((match = apiIdRegex.exec(html)) !== null) {
      const apiId = match[1];
      if (seen.has(apiId)) continue;
      seen.add(apiId);
      events.push({
        api_id: apiId,
        name: '',
        url: `https://lu.ma/event/${apiId}`,
      });
    }

    // Also look for event slug links
    const slugRegex = /href=["'](?:https?:\/\/(?:lu\.ma|luma\.com))?\/([\w-]{6,})["']/gi;
    const skipSlugs = new Set(['discover', 'create', 'login', 'signup', 'signin', 'about', 'pricing', 'terms', 'privacy', 'explore', 'search', 'settings', 'notifications', 'calendar', 'home']);
    while ((match = slugRegex.exec(html)) !== null) {
      const slug = match[1];
      if (skipSlugs.has(slug) || seen.has(slug)) continue;
      // Only include slugs that look like event IDs (short alphanumeric)
      if (slug.length > 30) continue;
      seen.add(slug);
      events.push({
        api_id: slug,
        name: '',
        url: `https://lu.ma/${slug}`,
      });
    }
  }

  return events;
}

async function searchLumaDiscover(query: string): Promise<LumaEvent[]> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
  };

  // Try the paginated events endpoint (most reliable)
  for (const base of LUMA_API_BASES) {
    const res = await tryFetch(`${base}/discover/get-paginated-events?query=${encodeURIComponent(query)}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res) continue;
    try {
      const json = await res.json();
      const entries = json.entries || [];
      if (entries.length > 0) {
        return entries.map(parseLumaEventEntry).filter((e: LumaEvent) => e.api_id);
      }
    } catch {
      continue;
    }
  }

  // Try the discover/search endpoint as backup
  for (const base of LUMA_API_BASES) {
    const res = await tryFetch(`${base}/discover/search?query=${encodeURIComponent(query)}&period=future`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res) continue;
    try {
      const json = await res.json();
      const entries = json.entries || json.events || [];
      if (entries.length > 0) {
        return entries.map(parseLumaEventEntry).filter((e: LumaEvent) => e.api_id);
      }
    } catch {
      continue;
    }
  }

  // Fall back to scraping discover page
  return await scrapeLumaDiscover(query);
}

async function scrapeLumaDiscover(query: string): Promise<LumaEvent[]> {
  // Try both old and new domains
  for (const domain of ['luma.com', 'lu.ma']) {
    try {
      const res = await fetch(`https://${domain}/discover?q=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,*/*',
        },
        signal: AbortSignal.timeout(10_000),
        redirect: 'follow',
      });

      if (!res.ok) continue;
      const html = await res.text();
      const events = extractEventsFromLumaHtml(html);
      if (events.length > 0) return events;
    } catch {
      continue;
    }
  }
  return [];
}

export async function gather(): Promise<GatheredEvent[]> {
  const allEvents = new Map<string, GatheredEvent>();

  // 1. Known calendars
  console.log('  Fetching known AI safety calendars...');
  for (const cal of KNOWN_CALENDARS) {
    const events = await fetchLumaCalendar(cal);
    console.log(`  → ${cal}: ${events.length} events`);

    for (const e of events) {
      if (!e.api_id || allEvents.has(e.api_id)) continue;

      let location = 'Online';
      if (e.geo_address_info) {
        const g = e.geo_address_info;
        const parts = [g.city, g.region, g.country].filter(Boolean);
        if (parts.length > 0) location = parts.join(', ');
      }

      allEvents.set(e.api_id, {
        title: e.name || `Luma Event ${e.api_id}`,
        description: e.description,
        url: e.url,
        source: 'luma',
        source_id: e.api_id,
        source_org: 'Luma',
        location,
        event_date: e.start_at ? e.start_at.substring(0, 10) : undefined,
        event_end_date: e.end_at ? e.end_at.substring(0, 10) : undefined,
      });
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  // 2. Keyword search
  console.log('\n  Searching Luma discover...');
  for (const query of SEARCH_QUERIES) {
    console.log(`  Searching: "${query}"...`);
    const events = await searchLumaDiscover(query);
    console.log(`  → ${events.length} results`);

    for (const e of events) {
      if (!e.api_id || allEvents.has(e.api_id)) continue;

      let location = 'Online';
      if (e.geo_address_info) {
        const g = e.geo_address_info;
        const parts = [g.city, g.region, g.country].filter(Boolean);
        if (parts.length > 0) location = parts.join(', ');
      }

      allEvents.set(e.api_id, {
        title: e.name || `Luma Event ${e.api_id}`,
        description: e.description,
        url: e.url,
        source: 'luma',
        source_id: e.api_id,
        source_org: 'Luma',
        location,
        event_date: e.start_at ? e.start_at.substring(0, 10) : undefined,
        event_end_date: e.end_at ? e.end_at.substring(0, 10) : undefined,
      });
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  return Array.from(allEvents.values());
}

export async function run(opts: { dryRun?: boolean } = {}) {
  const { dryRun = false } = opts;
  console.log(`📡 Luma Event Gatherer${dryRun ? ' (DRY RUN)' : ''}\n`);
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
