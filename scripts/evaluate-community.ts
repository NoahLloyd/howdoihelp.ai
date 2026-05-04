/**
 * evaluate-community.ts - The single gatekeeper for the community candidate
 * pipeline.
 *
 * As of v2, this script chains:
 *   1. The v2 pipeline (stage 1 Haiku text → stage 2 Sonnet vision when needed)
 *      to decide accept / reject. Same gate that the monthly reverify uses,
 *      so new candidates and existing rows are judged the same way.
 *   2. A metadata extractor (Sonnet) that runs only on accept and produces
 *      clean_title, clean_description, clean_location, suggested_ev,
 *      suggested_friction, duplicate_of, etc. — the fields the directory
 *      needs for ranking and display.
 *
 * Both calls go through CLAUDE_PROVIDER=cli (subscription) — zero $/run.
 *
 * Usage:
 *   npx tsx scripts/evaluate-community.ts --process-queue
 *   npx tsx scripts/evaluate-community.ts --process-queue --force
 *   npx tsx scripts/evaluate-community.ts --url "https://discord.gg/xyz"
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getSupabase } from './lib/insert-candidates';
import { evaluatePipeline, type PipelineResult } from './lib/evaluate-pipeline';
import { closeBrowser } from './lib/evaluate-stage2';
import {
  extractCommunityMetadata,
  type CommunityMetadata,
  type ExistingCandidate,
} from './lib/evaluate-candidate-metadata';

let _supabase: ReturnType<typeof getSupabase> | null = null;
function getDb() {
  if (!_supabase) _supabase = getSupabase();
  return _supabase;
}

const AUTO_PROMOTE_EV_THRESHOLD = 0.4;

// ─── Combined evaluation ────────────────────────────────────

interface CombinedEvaluation {
  verdict: 'accept' | 'reject';
  pipeline: PipelineResult;
  metadata: CommunityMetadata | null;
}

async function evaluateCandidateEnd2End(args: {
  url: string;
  candidate: { title?: string; description?: string; location?: string; source?: string; source_org?: string };
  existing: ExistingCandidate[];
}): Promise<CombinedEvaluation> {
  const pipeline = await evaluatePipeline(args.url, 'community');
  if (pipeline.finalVerdict === 'reject') {
    return { verdict: 'reject', pipeline, metadata: null };
  }
  const metadata = await extractCommunityMetadata({
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

// ─── Existing communities (for dedup) ───────────────────────

async function fetchExistingCommunities(): Promise<ExistingCandidate[]> {
  const all: ExistingCandidate[] = [];

  const { data: resources } = await getDb()
    .from('resources')
    .select('id, title, location, source_org, url')
    .eq('category', 'communities')
    .limit(500);

  for (const r of resources || []) {
    all.push({
      id: r.id,
      title: r.title,
      location: r.location,
      organization: r.source_org,
      url: r.url,
    });
  }

  const { data: candidates } = await getDb()
    .from('community_candidates')
    .select('id, title, location, ai_organization, url')
    .in('status', ['promoted', 'evaluated'])
    .limit(500);

  for (const c of candidates || []) {
    if (all.some(e => e.id === c.id)) continue;
    all.push({
      id: c.id,
      title: c.title,
      location: c.location,
      organization: c.ai_organization,
      url: c.url,
    });
  }

  return all;
}

// ─── Candidate processing ───────────────────────────────────

async function evaluateCandidate(
  candidateId: string,
  force = false,
  existingCommunities?: ExistingCandidate[],
): Promise<'promoted' | 'rejected' | 'evaluated' | 'skipped' | 'error'> {
  const { data: candidate, error } = await getDb()
    .from('community_candidates')
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
      .from('community_candidates')
      .update({ status: 'rejected', ai_reasoning: 'No URL — cannot evaluate', processed_at: new Date().toISOString() })
      .eq('id', candidateId);
    return 'rejected';
  }

  console.log(`  Evaluating: "${candidate.title}"`);

  if (!existingCommunities) {
    existingCommunities = await fetchExistingCommunities();
  }

  let evalResult: CombinedEvaluation;
  try {
    evalResult = await evaluateCandidateEnd2End({
      url: candidate.url,
      candidate: {
        title: candidate.title,
        description: candidate.description,
        location: candidate.location,
        source: candidate.source,
        source_org: candidate.source_org,
      },
      existing: existingCommunities,
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

  await getDb()
    .from('community_candidates')
    .update({
      ai_is_real_community: stage1.is_alive,
      ai_is_relevant: evalResult.verdict === 'accept' && stage1.is_on_topic,
      ai_relevance_score: verdictConf,
      ai_quality_score: verdictConf, // v2 doesn't separate; use the same conf
      ai_suggested_ev: metadata?.suggested_ev ?? null,
      ai_suggested_friction: metadata?.suggested_friction ?? null,
      ai_community_type: metadata?.community_type ?? null,
      ai_clean_title: metadata?.clean_title ?? null,
      ai_clean_description: metadata?.clean_description ?? null,
      ai_clean_location: metadata?.clean_location ?? null,
      ai_is_online: metadata?.is_online ?? null,
      ai_organization: metadata?.organization ?? null,
      ai_reasoning: reasoning,
      duplicate_of: metadata?.duplicate_of ?? null,
      processed_at: new Date().toISOString(),
      location: metadata?.clean_location || candidate.location,
    })
    .eq('id', candidateId);

  if (evalResult.verdict === 'reject') {
    await getDb()
      .from('community_candidates')
      .update({ status: 'rejected' })
      .eq('id', candidateId);
    console.log(`  ❌ Rejected: "${candidate.title}" (${evalResult.pipeline.decidedAt}, conf ${verdictConf.toFixed(2)})`);
    return 'rejected';
  }

  if (metadata!.duplicate_of) {
    // If this candidate is already promoted, dedup typically matches itself
    // or its own resource — don't downgrade it.
    if (candidate.status === 'promoted') {
      console.log(`  ✓ Already promoted; dedup match (${metadata!.duplicate_of}) ignored`);
      return 'promoted';
    }
    await getDb()
      .from('community_candidates')
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
    .from('community_candidates')
    .update({ status: 'evaluated' })
    .eq('id', candidateId);
  console.log(`  🟡 Needs review: "${candidate.title}" (ev=${metadata!.suggested_ev.toFixed(2)})`);
  return 'evaluated';
}

async function promoteToResources(
  candidateId: string,
  candidate: any,
  metadata: CommunityMetadata,
): Promise<string | null> {
  const resourceId = `eval-comm-${candidate.source}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const { error } = await getDb().from('resources').insert({
    id: resourceId,
    title: metadata.clean_title,
    description: metadata.clean_description,
    url: candidate.url,
    source_org: metadata.organization || candidate.source_org || candidate.source,
    category: 'communities',
    location: metadata.clean_location || candidate.location || 'Global',
    min_minutes: 5,
    ev_general: metadata.suggested_ev,
    friction: metadata.suggested_friction,
    enabled: true,
    status: 'approved',
    activity_score: 0.9,
    url_status: 'reachable',
    verification_notes: 'v2-accept',
    verified_at: new Date().toISOString(),
    is_online: metadata.is_online,
    source: candidate.source,
    source_id: candidate.source_id,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error(`  Failed to promote "${metadata.clean_title}":`, error.message);
    return null;
  }

  await getDb()
    .from('community_candidates')
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
    .from('community_candidates')
    .select('id')
    .in('status', statusFilter)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch queue:', error.message);
    return;
  }

  if (!candidates || candidates.length === 0) {
    console.log('📭 No pending community candidates to evaluate.');
    return;
  }

  console.log(`📋 Processing ${candidates.length} community candidates...\n`);

  const existingCommunities = await fetchExistingCommunities();
  console.log(`📦 Loaded ${existingCommunities.length} existing communities for duplicate detection.\n`);

  const counts = { promoted: 0, rejected: 0, evaluated: 0, skipped: 0, error: 0 };

  for (const c of candidates) {
    const result = await evaluateCandidate(c.id, force, existingCommunities);
    counts[result]++;

    if (result === 'promoted') {
      const { data: promoted } = await getDb()
        .from('community_candidates')
        .select('id, title, location, ai_organization, url')
        .eq('id', c.id)
        .single();
      if (promoted) {
        existingCommunities.push({
          id: promoted.id,
          title: promoted.title,
          location: promoted.location,
          organization: promoted.ai_organization,
          url: promoted.url,
        });
      }
    }
  }

  await closeBrowser().catch(() => undefined);

  console.log(`\n📊 Queue processing complete:`);
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
    .from('community_candidates')
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

  const candidateId = `manual-comm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await getDb().from('community_candidates').insert({
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

// ─── Exported run function ─────────────────────────────────

export async function run(opts: { processQueue?: boolean; force?: boolean; url?: string } = {}) {
  if (opts.processQueue) {
    await processQueue(opts.force || false);
  } else if (opts.url) {
    await evaluateSingleUrl(opts.url);
  } else {
    console.log(`Community Evaluator (v2) — gate via vision pipeline + metadata extractor

Usage:
  npx tsx scripts/evaluate-community.ts --url <URL>
  npx tsx scripts/evaluate-community.ts --process-queue [--force]
    `);
  }
}

if (process.argv[1]?.endsWith('/scripts/evaluate-community.ts')) {
  const args = process.argv.slice(2);
  const opts: Parameters<typeof run>[0] = {};

  if (args.includes('--process-queue')) {
    opts.processQueue = true;
    opts.force = args.includes('--force');
  } else if (args.includes('--url')) {
    opts.url = args[args.indexOf('--url') + 1];
  }

  run(opts).catch(async err => {
    console.error('💥 Fatal:', err);
    await closeBrowser().catch(() => undefined);
    process.exit(1);
  });
}
