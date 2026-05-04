/**
 * fix-global-locations.ts - One-time cleanup that re-extracts a proper
 * "City, Country" / "Country" / "Online" / "Unknown" location for every
 * resource currently tagged location="Global".
 *
 * The aisafety.com scraper drops everything as "Global" by default, so the
 * directory had ~115 entries (e.g. "AI Safety Aachen", "Sydney AI Safety
 * Space", "AI Safety Brazil") that are clearly geo-specific but landed in
 * the catch-all bucket. Country/city filtering and geo-sort can't surface
 * them properly until the location is fixed.
 *
 * For each Global row we ask Claude (subscription) to look at title +
 * description + URL and return a clean location, then write it back.
 *
 * Usage:
 *   CLAUDE_PROVIDER=cli npx tsx scripts/eval-cron/fix-global-locations.ts
 *   CLAUDE_PROVIDER=cli npx tsx scripts/eval-cron/fix-global-locations.ts --limit 5
 *   CLAUDE_PROVIDER=cli npx tsx scripts/eval-cron/fix-global-locations.ts --dry-run
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { callClaude } from '../lib/claude-call';

interface Row {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source_org: string | null;
  source: string | null;
  is_online: boolean | null;
}

interface LocationResult {
  location: string;            // "City, Country" / "Country" / "Online" / "Unknown"
  is_online: boolean;
  confidence: number;          // 0..1
  reasoning: string;
}

const SCHEMA = {
  type: 'object',
  properties: {
    location: { type: 'string' },
    is_online: { type: 'boolean' },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
  },
  required: ['location', 'is_online', 'confidence', 'reasoning'],
};

const SYSTEM_PROMPT = `You are cleaning up location metadata for an AI-safety directory.

Given a community's title, description, source organization, and URL, return its real location in standardized form.

Output rules:
- Local groups → "City, Country" (e.g. "Berlin, Germany", "São Paulo, Brazil"). Use English country names. Spell out city names fully.
- National groups with no specific city → just "Country" (e.g. "Sweden", "India", "Brazil").
- Genuinely online-only communities → "Online".
- If you genuinely can't tell from the inputs → "Unknown". Do NOT default to "Global" — that's the bucket we're trying to clean up.
- Title hints are STRONG: "AI Safety Aachen" → Aachen, Germany. "Sydney AI Safety Space" → Sydney, Australia. "AI Safety India" → India. "Caltech AI Alignment" → Pasadena, California, USA (Caltech is in Pasadena).
- University clubs → use the university's city (e.g., "MIT" → Cambridge, USA; "Oxford" → Oxford, UK; "Georgia Tech" → Atlanta, USA).
- Discord / Telegram / Slack URL with no other geo signal → "Online".
- "[Country] Chapter" / "[Country] Initiative" → that country.
- Set confidence high (0.9+) when the city is in the title or org name. Lower (0.5-0.8) for inferred (e.g. uni → city). Low (≤0.3) when you're guessing.

is_online:
- true if the community is purely online/virtual (no physical meetups).
- false if it's a local chapter or has any in-person component.
- false for "Country" entries (national-level orgs typically have meetups).

Return ONLY a JSON object.`;

interface Args {
  limit?: number;
  dryRun: boolean;
}
function parseArgs(): Args {
  const a = process.argv.slice(2);
  const li = a.indexOf('--limit');
  return {
    limit: li >= 0 ? parseInt(a[li + 1] || '0', 10) || undefined : undefined,
    dryRun: a.includes('--dry-run'),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

async function fetchGlobalRows(supa: Supa): Promise<Row[]> {
  const all: Row[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from('resources')
      .select('id, title, description, url, source_org, source, is_online')
      .eq('category', 'communities')
      .eq('enabled', true)
      .eq('location', 'Global')
      .range(from, from + 999);
    if (error) throw new Error(`fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as Row[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

const MODEL = process.env.LOCATION_MODEL || 'claude-haiku-4-5-20251001';

async function classify(row: Row): Promise<LocationResult | null> {
  const userText = `<community>
title: ${row.title}
description: ${row.description || '(none)'}
source: ${row.source_org || row.source || '(unknown)'}
url: ${row.url}
</community>

Return your JSON now.`;

  try {
    const result = await callClaude<LocationResult>({
      model: MODEL,
      systemPrompt: SYSTEM_PROMPT,
      userText,
      jsonSchema: SCHEMA,
      toolDescription: 'Submit the cleaned location for the community.',
    });
    return result.structured;
  } catch (err: any) {
    console.error(`  ✗ ${row.title}: ${err?.message || err}`);
    return null;
  }
}

async function main() {
  const { limit, dryRun } = parseArgs();
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  let rows = await fetchGlobalRows(supa);
  console.log(`Fetched ${rows.length} resources with location="Global".`);
  if (limit) {
    rows = rows.slice(0, limit);
    console.log(`Limited to ${rows.length}.`);
  }

  let changed = 0;
  let unchanged = 0;
  let unknown = 0;
  let lowConfidence = 0;
  let failed = 0;
  let processed = 0;
  const CONCURRENCY = 6;

  async function processOne(r: Row, idx: number): Promise<void> {
    const result = await classify(r);
    processed++;
    if (!result) {
      failed++;
      return;
    }

    const newLoc = (result.location || '').trim();
    const newOnline = Boolean(result.is_online);
    const same = newLoc === 'Global' || newLoc === '' || newLoc === r.title;

    if (same) {
      unchanged++;
      return;
    }

    if (newLoc === 'Unknown') unknown++;
    if (result.confidence < 0.5) lowConfidence++;

    const flag = newLoc === 'Unknown' ? '❓' : newLoc === 'Online' ? '🌐' : '📍';
    console.log(
      `[${idx + 1}/${rows.length}] ${flag} "${r.title.slice(0, 36).padEnd(36)}" → ${newLoc.padEnd(28)} (conf ${result.confidence.toFixed(2)})${newOnline !== r.is_online ? ` [is_online: ${r.is_online}→${newOnline}]` : ''}`,
    );

    if (dryRun) return;

    const update: Record<string, unknown> = { location: newLoc };
    if (newOnline !== r.is_online) update.is_online = newOnline;
    const { error } = await supa.from('resources').update(update).eq('id', r.id);
    if (error) {
      console.error(`  ✗ DB update failed: ${error.message}`);
      failed++;
    } else {
      changed++;
    }
  }

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < rows.length) {
      const i = cursor++;
      await processOne(rows[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker()));

  console.log('');
  console.log('Summary:');
  console.log(`  changed:        ${changed}`);
  console.log(`  unchanged:      ${unchanged}`);
  console.log(`  → Unknown:      ${unknown}`);
  console.log(`  low confidence: ${lowConfidence}`);
  console.log(`  failed:         ${failed}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
