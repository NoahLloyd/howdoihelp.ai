/**
 * evaluate-event.ts - The single gatekeeper for the event candidate pipeline.
 *
 * As of v2, this script chains:
 *   1. The v2 pipeline (stage 1 Haiku text → stage 2 Sonnet vision when needed)
 *      to decide accept / reject. Same gate that the monthly reverify uses,
 *      so new candidates and existing rows are judged the same way.
 *   2. A metadata extractor (Sonnet) that runs only on accept and produces
 *      clean_title, clean_description, suggested_ev, suggested_friction,
 *      duplicate_of, etc. — the fields the directory needs for ranking and
 *      display.
 *
 * Both calls go through CLAUDE_PROVIDER=cli (subscription) — zero $/run.
 *
 * Usage:
 *   # Process all pending candidates in the queue
 *   npx tsx scripts/evaluate-event.ts --process-queue
 *
 *   # Re-evaluate already-processed candidates
 *   npx tsx scripts/evaluate-event.ts --process-queue --force
 *
 *   # Evaluate a single URL (creates candidate + evaluates + optionally promotes)
 *   npx tsx scripts/evaluate-event.ts --url "https://lu.ma/ai-safety-hackathon"
 *
 *   # Evaluate from title/description (no URL scraping)
 *   npx tsx scripts/evaluate-event.ts --title "AI Safety Unconference" --description "..." --date "2026-03-15"
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getSupabase, insertCandidates } from './lib/insert-candidates';
import { preFilter } from './lib/pre-filter';
import { estimateEventMinutes } from './lib/estimate-time';
import { evaluatePipeline, type PipelineResult } from './lib/evaluate-pipeline';
import { closeBrowser } from './lib/evaluate-stage2';
import {
  extractEventMetadata,
  type EventMetadata,
  type ExistingCandidate,
} from './lib/evaluate-candidate-metadata';

// ─── Config (lazy init for serverless compatibility) ────────

let _supabase: ReturnType<typeof getSupabase> | null = null;
function getDb() {
  if (!_supabase) _supabase = getSupabase();
  return _supabase;
}

// Minimum suggested_ev to auto-promote. v2 already gated on accept/reject;
// this is just a "we accept it but is it valuable enough to surface?" cutoff.
const AUTO_PROMOTE_EV_THRESHOLD = 0.35;

// ─── Combined evaluation ────────────────────────────────────

interface CombinedEvaluation {
  /** Final accept/reject from v2 pipeline. */
  verdict: 'accept' | 'reject';
  /** v2 details (always present). */
  pipeline: PipelineResult;
  /** Metadata only present when verdict === 'accept'. */
  metadata: EventMetadata | null;
}

async function evaluateCandidateEnd2End(args: {
  url: string;
  candidate: { title?: string; description?: string; date?: string; location?: string; source?: string };
  existing: ExistingCandidate[];
}): Promise<CombinedEvaluation> {
  const pipeline = await evaluatePipeline(args.url, 'event');

  if (pipeline.finalVerdict === 'reject') {
    return { verdict: 'reject', pipeline, metadata: null };
  }

  const metadata = await extractEventMetadata({
    url: args.url,
    scrape: pipeline.scrape,
    candidate: args.candidate,
    existing: args.existing,
  });
  return { verdict: 'accept', pipeline, metadata };
}

function combinedReasoning(c: CombinedEvaluation): string {
  const lines = [
    `[v2 ${c.pipeline.decidedAt} ${c.pipeline.finalVerdict}, conf ${(c.pipeline.stage2?.confidence ?? c.pipeline.stage1.confidence).toFixed(2)}]`,
    c.pipeline.stage1.reasoning,
  ];
  if (c.pipeline.stage2) lines.push(`stage2: ${c.pipeline.stage2.reasoning}`);
  if (c.metadata) lines.push(`metadata: ${c.metadata.reasoning}`);
  return lines.filter(Boolean).join(' | ').slice(0, 4000);
}

// ─── Existing Events (for dedup) ────────────────────────────

async function fetchExistingEvents(): Promise<ExistingCandidate[]> {
  const events: ExistingCandidate[] = [];

  const { data: resources } = await getDb()
    .from('resources')
    .select('id, title, event_date, location, source_org, url')
    .eq('category', 'events')
    .limit(300);

  for (const r of resources || []) {
    events.push({
      id: r.id,
      title: r.title,
      event_date: r.event_date,
      location: r.location,
      organization: r.source_org,
      url: r.url,
    });
  }

  const { data: candidates } = await getDb()
    .from('event_candidates')
    .select('id, title, event_date, location, ai_organization, url')
    .in('status', ['promoted', 'evaluated'])
    .limit(300);

  for (const c of candidates || []) {
    if (events.some(e => e.id === c.id)) continue;
    events.push({
      id: c.id,
      title: c.title,
      event_date: c.event_date,
      location: c.location,
      organization: c.ai_organization,
      url: c.url,
    });
  }

  return events;
}

// ─── Candidate processing ──────────────────────────────────

async function evaluateCandidate(
  candidateId: string,
  force = false,
  existingEvents?: ExistingCandidate[],
): Promise<'promoted' | 'rejected' | 'evaluated' | 'skipped' | 'error'> {
  const { data: candidate, error } = await getDb()
    .from('event_candidates')
    .select('*')
    .eq('id', candidateId)
    .single();

  if (error || !candidate) {
    console.error(`  Could not fetch candidate ${candidateId}`);
    return 'error';
  }

  if (!force && candidate.status !== 'pending') {
    return 'skipped';
  }

  if (!candidate.url) {
    await getDb()
      .from('event_candidates')
      .update({ status: 'rejected', ai_reasoning: 'No URL — cannot evaluate', processed_at: new Date().toISOString() })
      .eq('id', candidateId);
    return 'rejected';
  }

  console.log(`  Evaluating: "${candidate.title}"`);

  if (!existingEvents) {
    existingEvents = await fetchExistingEvents();
  }

  let evalResult: CombinedEvaluation;
  try {
    evalResult = await evaluateCandidateEnd2End({
      url: candidate.url,
      candidate: {
        title: candidate.title,
        description: candidate.description,
        date: candidate.event_date,
        location: candidate.location,
        source: candidate.source,
      },
      existing: existingEvents,
    });
  } catch (err: any) {
    console.error(`  v2 evaluation failed for "${candidate.title}":`, err.message);
    return 'error';
  }

  const reasoning = combinedReasoning(evalResult);
  const metadata = evalResult.metadata;
  const stage1 = evalResult.pipeline.stage1;
  const stage2 = evalResult.pipeline.stage2;
  const verdictConf = stage2?.confidence ?? stage1.confidence;

  // Persist evaluation to candidate row. Backfill old "ai_*" column names so
  // the admin UI keeps working without schema changes.
  const updateBase: Record<string, unknown> = {
    ai_is_real_event: stage1.is_alive,
    ai_is_relevant: evalResult.verdict === 'accept' && stage1.is_on_topic,
    ai_relevance_score: verdictConf,
    ai_impact_score: metadata?.impact_score ?? null,
    ai_suggested_ev: metadata?.suggested_ev ?? null,
    ai_suggested_friction: metadata?.suggested_friction ?? null,
    ai_event_type: metadata?.event_type ?? null,
    ai_summary: metadata?.clean_description ?? null,
    ai_reasoning: reasoning,
    ai_organization: metadata?.organization ?? null,
    ai_is_online: metadata?.is_online ?? null,
    duplicate_of: metadata?.duplicate_of ?? null,
    processed_at: new Date().toISOString(),
    event_date: metadata?.event_date || candidate.event_date,
    event_end_date: metadata?.event_end_date || candidate.event_end_date,
    event_time: metadata?.event_time ?? null,
    location: metadata?.location || candidate.location,
  };
  await getDb().from('event_candidates').update(updateBase).eq('id', candidateId);

  if (evalResult.verdict === 'reject') {
    await getDb()
      .from('event_candidates')
      .update({ status: 'rejected' })
      .eq('id', candidateId);
    console.log(`  ❌ Rejected: "${candidate.title}" (${evalResult.pipeline.decidedAt}, conf ${verdictConf.toFixed(2)})`);
    return 'rejected';
  }

  // accept path — we have metadata
  if (metadata!.duplicate_of) {
    // If this candidate is already promoted, dedup typically matches itself
    // or its own resource — don't downgrade it.
    if (candidate.status === 'promoted') {
      console.log(`  ✓ Already promoted; dedup match (${metadata!.duplicate_of}) ignored`);
      return 'promoted';
    }
    await getDb()
      .from('event_candidates')
      .update({
        status: 'rejected',
        ai_reasoning: `Duplicate of ${metadata!.duplicate_of}. ${reasoning}`,
      })
      .eq('id', candidateId);
    console.log(`  🔁 Duplicate: "${candidate.title}" → ${metadata!.duplicate_of}`);
    return 'rejected';
  }

  if (metadata!.suggested_ev >= AUTO_PROMOTE_EV_THRESHOLD) {
    // Avoid re-promoting an already-promoted candidate (would create a duplicate
    // row in resources). On --force we still updated the metadata above; just
    // skip the second insert.
    if (candidate.status === 'promoted' && candidate.promoted_resource_id) {
      console.log(`  ✓ Already promoted: "${metadata!.clean_title}" → ${candidate.promoted_resource_id} (metadata refreshed)`);
      return 'promoted';
    }
    const resourceId = await promoteToResources(candidateId, candidate, metadata!);
    if (resourceId) {
      console.log(`  ✅ Promoted: "${metadata!.clean_title}" (ev=${metadata!.suggested_ev.toFixed(2)}, conf=${verdictConf.toFixed(2)})`);
      return 'promoted';
    }
    return 'error';
  }

  await getDb()
    .from('event_candidates')
    .update({ status: 'evaluated' })
    .eq('id', candidateId);
  console.log(`  🟡 Needs review: "${candidate.title}" (ev=${metadata!.suggested_ev.toFixed(2)})`);
  return 'evaluated';
}

async function promoteToResources(
  candidateId: string,
  candidate: any,
  metadata: EventMetadata,
): Promise<string | null> {
  const resourceId = `eval-${candidate.source}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const PROGRAM_TYPES = ['fellowship', 'course', 'program'];
  const category = PROGRAM_TYPES.includes(metadata.event_type) ? 'programs' : 'events';

  const { error } = await getDb().from('resources').insert({
    id: resourceId,
    title: metadata.clean_title,
    description: metadata.clean_description,
    url: candidate.url,
    source_org: metadata.organization || candidate.source_org || candidate.source,
    category,
    location: metadata.location || candidate.location || 'Global',
    min_minutes: estimateEventMinutes(
      metadata.event_type,
      metadata.event_date || candidate.event_date,
      metadata.event_end_date,
    ),
    ev_general: metadata.suggested_ev,
    friction: metadata.suggested_friction,
    enabled: true,
    status: 'approved',
    event_date: metadata.event_date || candidate.event_date || null,
    event_end_date: metadata.event_end_date || null,
    event_time: metadata.event_time || null,
    event_type: metadata.event_type,
    is_online: metadata.is_online,
    activity_score: 0.9,
    url_status: 'reachable',
    verification_notes: 'v2-accept',
    verified_at: new Date().toISOString(),
    source: candidate.source,
    source_id: candidate.source_id,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error(`  Failed to promote "${metadata.clean_title}":`, error.message);
    return null;
  }

  await getDb()
    .from('event_candidates')
    .update({
      status: 'promoted',
      promoted_at: new Date().toISOString(),
      promoted_resource_id: resourceId,
    })
    .eq('id', candidateId);

  return resourceId;
}

// ─── CLI Modes ─────────────────────────────────────────────

async function processQueue(force = false) {
  const statusFilter = force ? ['pending', 'evaluated', 'rejected'] : ['pending'];

  const { data: candidates, error } = await getDb()
    .from('event_candidates')
    .select('id')
    .in('status', statusFilter)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch queue:', error.message);
    return;
  }

  if (!candidates || candidates.length === 0) {
    console.log('📭 No pending candidates to evaluate.');
    return;
  }

  // Pre-filter to drop obvious junk before any LLM call.
  const { data: fullCandidates } = await getDb()
    .from('event_candidates')
    .select('id, title, description, source_org, url')
    .in('id', candidates.map(c => c.id));

  const candidateEvents = (fullCandidates || []).map(c => ({
    title: c.title || '',
    description: c.description || '',
    url: c.url || '',
    source: '',
    source_id: c.id,
    source_org: c.source_org || '',
  }));

  const { kept, rejected: prefiltered } = preFilter(candidateEvents);
  const keptIds = new Set(kept.map(e => e.source_id));

  let prefilteredCount = 0;
  for (const r of prefiltered) {
    await getDb()
      .from('event_candidates')
      .update({ status: 'rejected', ai_reasoning: `Pre-filter: ${r.reason}` })
      .eq('id', r.event.source_id);
    prefilteredCount++;
  }
  if (prefilteredCount > 0) {
    console.log(`🚫 Pre-filter auto-rejected ${prefilteredCount} obviously irrelevant candidates.`);
  }

  const toEvaluate = candidates.filter(c => keptIds.has(c.id));
  console.log(`📋 Processing ${toEvaluate.length} candidates (${prefilteredCount} pre-filtered)...\n`);

  const existingEvents = await fetchExistingEvents();
  console.log(`📦 Loaded ${existingEvents.length} existing events for duplicate detection.\n`);

  const counts = { promoted: 0, rejected: 0, evaluated: 0, skipped: 0, error: 0 };

  for (const c of toEvaluate) {
    const result = await evaluateCandidate(c.id, force, existingEvents);
    counts[result]++;

    if (result === 'promoted') {
      const { data: promoted } = await getDb()
        .from('event_candidates')
        .select('id, title, event_date, location, ai_organization, url')
        .eq('id', c.id)
        .single();
      if (promoted) {
        existingEvents.push({
          id: promoted.id,
          title: promoted.title,
          event_date: promoted.event_date,
          location: promoted.location,
          organization: promoted.ai_organization,
          url: promoted.url,
        });
      }
    }
  }

  await closeBrowser().catch(() => undefined);

  console.log(`\n📊 Queue processing complete:`);
  console.log(`   🚫 Pre-filtered: ${prefilteredCount}`);
  console.log(`   ✅ Promoted:     ${counts.promoted}`);
  console.log(`   ❌ Rejected:     ${counts.rejected}`);
  console.log(`   🟡 Needs review: ${counts.evaluated}`);
  console.log(`   ⏭️  Skipped:      ${counts.skipped}`);
  console.log(`   💥 Errors:       ${counts.error}`);
}

async function evaluateSingleUrl(url: string) {
  console.log(`🔍 Evaluating URL: ${url}\n`);

  const hostname = new URL(url).hostname.replace(/^www\./, '');
  const pathname = new URL(url).pathname.replace(/\/+$/, '');

  const { data: existing } = await getDb()
    .from('event_candidates')
    .select('id, title, status')
    .or(`url.ilike.%${hostname}${pathname}%,url.ilike.%${hostname}${pathname}`)
    .limit(1);

  if (existing?.[0]) {
    console.log(`Found existing candidate: "${existing[0].title}" (status: ${existing[0].status})`);
    console.log('Re-evaluating...\n');
    const outcome = await evaluateCandidate(existing[0].id, true);
    await closeBrowser().catch(() => undefined);
    console.log(`\nResult: ${outcome}`);
    return;
  }

  console.log('No existing candidate found. Creating new entry...\n');

  const candidateId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await getDb().from('event_candidates').insert({
    id: candidateId,
    title: 'Unknown (pending scrape)',
    url,
    source: 'manual',
    source_id: `manual-${Date.now()}`,
    status: 'pending',
  });

  if (error) {
    console.error('Failed to create candidate:', error.message);
    return;
  }

  const outcome = await evaluateCandidate(candidateId, true);
  await closeBrowser().catch(() => undefined);
  console.log(`\nResult: ${outcome}`);
}

async function evaluateSingleDescription(title: string, description?: string, date?: string) {
  console.log(`🔍 Evaluating: "${title}"\n`);

  const result = await insertCandidates([{
    title,
    description,
    url: `manual://${Date.now()}`,
    source: 'manual',
    source_id: `manual-${Date.now()}`,
    event_date: date,
  }]);

  if (result.inserted === 0) {
    console.log('Failed to insert candidate.');
    return;
  }

  const { data: recent } = await getDb()
    .from('event_candidates')
    .select('id')
    .eq('source', 'manual')
    .order('created_at', { ascending: false })
    .limit(1);

  if (recent?.[0]) {
    const outcome = await evaluateCandidate(recent[0].id, true);
    await closeBrowser().catch(() => undefined);
    console.log(`\nResult: ${outcome}`);
  }
}

// ─── Exported run function ───────────────────────────────────

export async function run(opts: { processQueue?: boolean; force?: boolean; url?: string; title?: string; description?: string; date?: string } = {}) {
  if (opts.processQueue) {
    await processQueue(opts.force || false);
  } else if (opts.url) {
    await evaluateSingleUrl(opts.url);
  } else if (opts.title) {
    await evaluateSingleDescription(opts.title, opts.description, opts.date);
  } else {
    console.log('Event Evaluator: no action specified');
  }
}

if (process.argv[1]?.endsWith('/scripts/evaluate-event.ts')) {
  const args = process.argv.slice(2);
  const opts: Parameters<typeof run>[0] = {};

  if (args.includes('--process-queue')) {
    opts.processQueue = true;
    opts.force = args.includes('--force');
  } else if (args.includes('--url')) {
    opts.url = args[args.indexOf('--url') + 1];
  } else if (args.includes('--title')) {
    opts.title = args[args.indexOf('--title') + 1];
    const descIdx = args.indexOf('--description');
    if (descIdx >= 0) opts.description = args[descIdx + 1];
    const dateIdx = args.indexOf('--date');
    if (dateIdx >= 0) opts.date = args[dateIdx + 1];
  }

  run(opts).catch(async err => {
    console.error('💥 Fatal:', err);
    await closeBrowser().catch(() => undefined);
    process.exit(1);
  });
}
