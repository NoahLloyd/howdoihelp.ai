/**
 * insert-program-candidates.ts — Shared utility for inserting program candidates.
 *
 * All program gatherers use this to insert into `program_candidates` with dedup.
 */

import { getSupabase } from './insert-candidates';

export interface GatheredProgram {
  title: string;
  description?: string;
  url: string;
  source: string;
  source_id: string;
  source_org?: string;
  location?: string;
  course_type?: string;
  duration_description?: string;
  duration_hours?: number;
  application_deadline?: string;
  start_date?: string;
  end_date?: string;
  date_range?: string;
  submitted_by?: string;
}

export interface InsertResult {
  inserted: number;
  skipped: number;
  errors: number;
}

/**
 * Insert gathered programs into program_candidates, skipping duplicates.
 * Deduplicates by (source + source_id) and by URL.
 */
export async function insertProgramCandidates(programs: GatheredProgram[]): Promise<InsertResult> {
  const supabase = getSupabase();
  const result: InsertResult = { inserted: 0, skipped: 0, errors: 0 };

  if (programs.length === 0) return result;

  // Fetch existing candidates for dedup by source_id and URL
  const { data: existing } = await supabase
    .from('program_candidates')
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

  // Also check resources table to avoid re-gathering already-promoted programs
  const { data: existingResources } = await supabase
    .from('resources')
    .select('source, source_id, url')
    .eq('category', 'programs');

  for (const row of existingResources || []) {
    if (row.source && row.source_id) {
      existingKeys.add(`${row.source}:${row.source_id}`);
    }
    if (row.url) {
      existingUrls.add(normalizeUrl(row.url));
    }
  }

  for (const prog of programs) {
    const key = `${prog.source}:${prog.source_id}`;
    const normalUrl = normalizeUrl(prog.url);

    if (existingKeys.has(key) || existingUrls.has(normalUrl)) {
      result.skipped++;
      continue;
    }

    const id = `cand-prog-${prog.source}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const { error } = await supabase.from('program_candidates').insert({
      id,
      title: prog.title,
      description: prog.description || null,
      url: prog.url,
      source: prog.source,
      source_id: prog.source_id,
      source_org: prog.source_org || null,
      location: prog.location || null,
      course_type: prog.course_type || null,
      duration_description: prog.duration_description || null,
      duration_hours: prog.duration_hours || null,
      application_deadline: prog.application_deadline || null,
      start_date: prog.start_date || null,
      end_date: prog.end_date || null,
      date_range: prog.date_range || null,
      submitted_by: prog.submitted_by || null,
      status: 'pending',
    });

    if (error) {
      result.errors++;
      console.error(`  Failed to insert "${prog.title}":`, error.message);
    } else {
      result.inserted++;
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
