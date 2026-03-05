/**
 * insert-candidates.ts - Shared utility for inserting event candidates.
 *
 * All gatherers use this to insert into `event_candidates` with dedup.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface GatheredEvent {
  title: string;
  description?: string;
  url: string;
  source: string;
  source_id: string;
  source_org?: string;
  location?: string;
  event_date?: string;
  event_end_date?: string;
  submitted_by?: string;
}

export interface InsertResult {
  inserted: number;
  skipped: number;
  errors: number;
}

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE env vars - check .env.local');
  }
  _supabase = createClient(url, key);
  return _supabase;
}

/**
 * Insert gathered events into event_candidates, skipping duplicates.
 * Deduplicates by (source + source_id) and by URL.
 */
export async function insertCandidates(events: GatheredEvent[]): Promise<InsertResult> {
  const supabase = getSupabase();
  const result: InsertResult = { inserted: 0, skipped: 0, errors: 0 };

  if (events.length === 0) return result;

  // Fetch existing candidates for dedup
  const { data: existing } = await supabase
    .from('event_candidates')
    .select('source, source_id, url');

  const existingKeys = new Set<string>();
  const existingUrls = new Set<string>();
  for (const row of existing || []) {
    if (row.source && row.source_id) {
      existingKeys.add(`${row.source}:${row.source_id}`);
    }
    if (row.url) {
      existingUrls.add(normalizeUrl(row.url));
    }
  }

  // Also check resources table to avoid re-gathering already-promoted events
  const { data: existingResources } = await supabase
    .from('resources')
    .select('url, source, source_id')
    .eq('category', 'events');

  for (const row of existingResources || []) {
    if (row.source && row.source_id) {
      existingKeys.add(`${row.source}:${row.source_id}`);
    }
    if (row.url) {
      existingUrls.add(normalizeUrl(row.url));
    }
  }

  for (const event of events) {
    const key = `${event.source}:${event.source_id}`;
    const normalUrl = normalizeUrl(event.url);

    if (existingKeys.has(key) || existingUrls.has(normalUrl)) {
      result.skipped++;
      continue;
    }

    const id = `cand-${event.source}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const { error } = await supabase.from('event_candidates').insert({
      id,
      title: event.title,
      description: event.description || null,
      url: event.url,
      source: event.source,
      source_id: event.source_id,
      source_org: event.source_org || null,
      location: event.location || null,
      event_date: event.event_date || null,
      event_end_date: event.event_end_date || null,
      submitted_by: event.submitted_by || null,
      status: 'pending',
    });

    if (error) {
      result.errors++;
      console.error(`  Failed to insert "${event.title}":`, error.message);
    } else {
      result.inserted++;
      // Track for dedup within this batch
      existingKeys.add(key);
      existingUrls.add(normalUrl);
    }
  }

  return result;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
}
