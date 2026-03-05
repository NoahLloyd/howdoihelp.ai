/**
 * insert-community-candidates.ts - Shared utility for inserting community candidates.
 *
 * All community gatherers use this to insert into `community_candidates` with dedup.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './insert-candidates';

export interface GatheredCommunity {
  title: string;
  description?: string;
  url: string;
  source: string;
  source_id: string;
  source_org?: string;
  location?: string;
  submitted_by?: string;
}

export interface InsertResult {
  inserted: number;
  skipped: number;
  errors: number;
}

/**
 * Insert gathered communities into community_candidates, skipping duplicates.
 * Deduplicates by (source + source_id) and by URL.
 */
export async function insertCommunityCandidates(communities: GatheredCommunity[]): Promise<InsertResult> {
  const supabase = getSupabase();
  const result: InsertResult = { inserted: 0, skipped: 0, errors: 0 };

  if (communities.length === 0) return result;

  // Fetch existing candidates for dedup
  const { data: existing } = await supabase
    .from('community_candidates')
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

  // Also check resources table to avoid re-gathering already-promoted communities
  const { data: existingResources } = await supabase
    .from('resources')
    .select('url, source, source_id')
    .eq('category', 'communities');

  for (const row of existingResources || []) {
    if (row.source && row.source_id) {
      existingKeys.add(`${row.source}:${row.source_id}`);
    }
    if (row.url) {
      existingUrls.add(normalizeUrl(row.url));
    }
  }

  for (const comm of communities) {
    const key = `${comm.source}:${comm.source_id}`;
    const normalUrl = normalizeUrl(comm.url);

    if (existingKeys.has(key) || existingUrls.has(normalUrl)) {
      result.skipped++;
      continue;
    }

    const id = `cand-comm-${comm.source}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const { error } = await supabase.from('community_candidates').insert({
      id,
      title: comm.title,
      description: comm.description || null,
      url: comm.url,
      source: comm.source,
      source_id: comm.source_id,
      source_org: comm.source_org || null,
      location: comm.location || null,
      submitted_by: comm.submitted_by || null,
      status: 'pending',
    });

    if (error) {
      result.errors++;
      console.error(`  Failed to insert "${comm.title}":`, error.message);
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
