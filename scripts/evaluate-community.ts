/**
 * evaluate-community.ts - The central AI community evaluator.
 *
 * This is the single gatekeeper for the community pipeline. Nothing enters
 * the public `resources` table without passing through this script.
 *
 * Usage:
 *   # Evaluate a single URL (creates candidate + evaluates + optionally promotes)
 *   npx tsx scripts/evaluate-community.ts --url "https://discord.gg/aisafety"
 *
 *   # Process all pending candidates in the queue
 *   npx tsx scripts/evaluate-community.ts --process-queue
 *
 *   # Re-evaluate already-processed candidates
 *   npx tsx scripts/evaluate-community.ts --process-queue --force
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import Anthropic from '@anthropic-ai/sdk';
import { scrapeUrl } from './lib/scrape-url';
import { getSupabase } from './lib/insert-candidates';
import { getActivePrompt, interpolateTemplate } from '../src/lib/prompts';

// ─── Config (lazy init for serverless compatibility) ────────

let _anthropic: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('Missing ANTHROPIC_API_KEY');
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

let _supabase: ReturnType<typeof getSupabase> | null = null;
function getDb() {
  if (!_supabase) _supabase = getSupabase();
  return _supabase;
}

// Thresholds for auto-promote / auto-reject
const AUTO_PROMOTE_RELEVANCE = 0.5;
const AUTO_PROMOTE_QUALITY = 0.4;
const AUTO_REJECT_RELEVANCE = 0.2;
const AUTO_REJECT_QUALITY = 0.15;

// ─── AI Evaluation ─────────────────────────────────────────

interface AIEvaluation {
  is_real_community: boolean;
  is_relevant: boolean;
  relevance_score: number;
  quality_score: number;
  suggested_ev: number;
  suggested_friction: number;
  community_type: string;
  clean_title: string;
  clean_description: string;
  clean_location: string;
  is_online: boolean;
  organization: string;
  duplicate_of: string | null;
  reasoning: string;
}

interface ExistingCommunity {
  id: string;
  title: string;
  location: string | null;
  organization: string | null;
  url: string;
}

async function evaluateWithAI(
  title: string,
  url: string,
  scrapedText: string,
  metadata: {
    description?: string;
    location?: string;
    source?: string;
    source_org?: string;
  },
  existingCommunities: ExistingCommunity[] = [],
  modelOverride?: string,
): Promise<AIEvaluation> {
  // Build template variables
  const scrapedTextVar = `Evaluate this community candidate:

<community>
Title: ${title}
URL: ${url}
Claimed location: ${metadata.location || 'Unknown'}
Source platform: ${metadata.source || 'Unknown'}
Source organization: ${metadata.source_org || 'Unknown'}
Provided description: ${metadata.description || 'None'}
</community>

<scraped_page_content>
${scrapedText || '[Page could not be scraped]'}
</scraped_page_content>`;

  let existingCommunitiesVar = '';
  if (existingCommunities.length > 0) {
    const lines = existingCommunities.map(e =>
      `[${e.id}] "${e.title}" | ${e.location || 'unknown'} | ${e.organization || 'unknown'} | ${e.url}`
    );
    existingCommunitiesVar = `<existing_communities>
Check if this candidate is a duplicate of any of these existing communities. If so, set duplicate_of to the matching community's ID.

${lines.join('\n')}
</existing_communities>`;
  }

  const activePrompt = await getActivePrompt("evaluate-community");
  const fullPrompt = interpolateTemplate(activePrompt.content, {
    scraped_text: scrapedTextVar,
    existing_communities: existingCommunitiesVar,
  });

  const model = modelOverride || process.env.EVAL_MODEL || activePrompt.model || 'claude-haiku-4-5-20251001';
  console.log(`  Using model: ${model}`);

  const response = await getAnthropicClient().messages.create({
    model,
    max_tokens: 1024,
    messages: [
      { role: 'user', content: fullPrompt },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Parse JSON from response, handling possible markdown fences
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      is_real_community: Boolean(parsed.is_real_community),
      is_relevant: Boolean(parsed.is_relevant),
      relevance_score: clamp(Number(parsed.relevance_score) || 0),
      quality_score: clamp(Number(parsed.quality_score) || 0),
      suggested_ev: clamp(Number(parsed.suggested_ev) || 0),
      suggested_friction: clamp(Number(parsed.suggested_friction) || 0),
      community_type: parsed.community_type || 'other',
      clean_title: parsed.clean_title || title,
      clean_description: parsed.clean_description || '',
      clean_location: parsed.clean_location || 'Unknown',
      is_online: Boolean(parsed.is_online),
      organization: parsed.organization || '',
      duplicate_of: parsed.duplicate_of || null,
      reasoning: parsed.reasoning || '',
    };
  } catch (err) {
    console.error('Failed to parse AI response:', text.slice(0, 200));
    throw new Error('AI returned invalid JSON');
  }
}

function clamp(n: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, n));
}

// ─── Existing Communities (for dedup) ────────────────────────

async function fetchExistingCommunities(): Promise<ExistingCommunity[]> {
  const communities: ExistingCommunity[] = [];

  // Fetch live resources (promoted communities)
  const { data: resources } = await getDb()
    .from('resources')
    .select('id, title, location, source_org, url')
    .eq('category', 'communities')
    .limit(500);

  for (const r of resources || []) {
    communities.push({
      id: r.id,
      title: r.title,
      location: r.location,
      organization: r.source_org,
      url: r.url,
    });
  }

  // Fetch already-evaluated/promoted candidates
  const { data: candidates } = await getDb()
    .from('community_candidates')
    .select('id, title, location, ai_organization, url')
    .in('status', ['promoted', 'evaluated'])
    .limit(500);

  for (const c of candidates || []) {
    if (communities.some(e => e.id === c.id)) continue;
    communities.push({
      id: c.id,
      title: c.title,
      location: c.location,
      organization: c.ai_organization,
      url: c.url,
    });
  }

  return communities;
}

// ─── Candidate Processing ──────────────────────────────────

async function evaluateCandidate(candidateId: string, force = false, existingCommunities?: ExistingCommunity[], modelOverride?: string): Promise<'promoted' | 'rejected' | 'evaluated' | 'skipped' | 'error'> {
  // Fetch the candidate
  const { data: candidate, error } = await getDb()
    .from('community_candidates')
    .select('*')
    .eq('id', candidateId)
    .single();

  if (error || !candidate) {
    console.error(`  Could not fetch candidate ${candidateId}`);
    return 'error';
  }

  // Skip if already processed (unless forced)
  if (!force && candidate.status !== 'pending') {
    return 'skipped';
  }

  console.log(`  Evaluating: "${candidate.title}"`);

  // Step 1: Scrape the URL for context
  let scrapedText = candidate.scraped_text || '';

  if (!scrapedText && candidate.url) {
    const scraped = await scrapeUrl(candidate.url);
    scrapedText = scraped.text;

    // Save scraped text so we don't re-scrape
    await getDb()
      .from('community_candidates')
      .update({ scraped_text: scrapedText })
      .eq('id', candidateId);
  }

  // Step 2: Fetch existing communities for dedup (reuse if provided)
  if (!existingCommunities) {
    existingCommunities = await fetchExistingCommunities();
  }

  // Step 3: Call Claude for evaluation
  let evaluation: AIEvaluation;
  try {
    evaluation = await evaluateWithAI(
      candidate.title,
      candidate.url,
      scrapedText,
      {
        description: candidate.description,
        location: candidate.location,
        source: candidate.source,
        source_org: candidate.source_org,
      },
      existingCommunities,
      modelOverride,
    );
  } catch (err: any) {
    console.error(`  AI evaluation failed for "${candidate.title}":`, err.message);
    return 'error';
  }

  // Step 4: Store AI results
  await getDb()
    .from('community_candidates')
    .update({
      ai_is_real_community: evaluation.is_real_community,
      ai_is_relevant: evaluation.is_relevant,
      ai_relevance_score: evaluation.relevance_score,
      ai_quality_score: evaluation.quality_score,
      ai_suggested_ev: evaluation.suggested_ev,
      ai_suggested_friction: evaluation.suggested_friction,
      ai_community_type: evaluation.community_type,
      ai_clean_title: evaluation.clean_title,
      ai_clean_description: evaluation.clean_description,
      ai_clean_location: evaluation.clean_location,
      ai_is_online: evaluation.is_online,
      ai_organization: evaluation.organization,
      ai_reasoning: evaluation.reasoning,
      duplicate_of: evaluation.duplicate_of,
      processed_at: new Date().toISOString(),
      location: evaluation.clean_location || candidate.location,
    })
    .eq('id', candidateId);

  // Step 5: Decide fate

  // Check for duplicate first
  if (evaluation.duplicate_of) {
    await getDb()
      .from('community_candidates')
      .update({ status: 'rejected', ai_reasoning: `Duplicate of ${evaluation.duplicate_of}. ${evaluation.reasoning}` })
      .eq('id', candidateId);
    console.log(`  🔁 Duplicate: "${candidate.title}" → duplicate of ${evaluation.duplicate_of}`);
    return 'rejected';
  }

  if (!evaluation.is_real_community || !evaluation.is_relevant ||
      evaluation.relevance_score < AUTO_REJECT_RELEVANCE || evaluation.quality_score < AUTO_REJECT_QUALITY) {
    await getDb()
      .from('community_candidates')
      .update({ status: 'rejected' })
      .eq('id', candidateId);
    console.log(`  ❌ Rejected: "${candidate.title}" (real=${evaluation.is_real_community}, relevant=${evaluation.is_relevant}, relevance=${evaluation.relevance_score.toFixed(2)}, quality=${evaluation.quality_score.toFixed(2)})`);
    return 'rejected';
  }

  if (evaluation.is_real_community && evaluation.is_relevant &&
      evaluation.relevance_score >= AUTO_PROMOTE_RELEVANCE && evaluation.quality_score >= AUTO_PROMOTE_QUALITY) {
    // Auto-promote
    const resourceId = await promoteToResources(candidateId, candidate, evaluation);
    if (resourceId) {
      console.log(`  ✅ Promoted: "${evaluation.clean_title}" (ev=${evaluation.suggested_ev.toFixed(2)}, relevance=${evaluation.relevance_score.toFixed(2)}, quality=${evaluation.quality_score.toFixed(2)})`);
      return 'promoted';
    }
    return 'error';
  }

  // Borderline - needs admin review
  await getDb()
    .from('community_candidates')
    .update({ status: 'evaluated' })
    .eq('id', candidateId);
  console.log(`  🟡 Needs review: "${candidate.title}" (relevance=${evaluation.relevance_score.toFixed(2)}, quality=${evaluation.quality_score.toFixed(2)})`);
  return 'evaluated';
}

async function promoteToResources(
  candidateId: string,
  candidate: any,
  evaluation: AIEvaluation
): Promise<string | null> {
  const resourceId = `eval-comm-${candidate.source}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const { error } = await getDb().from('resources').insert({
    id: resourceId,
    title: evaluation.clean_title,
    description: evaluation.clean_description,
    url: candidate.url,
    source_org: evaluation.organization || candidate.source_org || candidate.source,
    category: 'communities',
    location: evaluation.clean_location || candidate.location || 'Global',
    min_minutes: 5,
    ev_general: evaluation.suggested_ev,
    friction: evaluation.suggested_friction,
    enabled: true,
    status: 'approved',
    activity_score: evaluation.quality_score,
    url_status: 'reachable',
    source: candidate.source,
    source_id: candidate.source_id,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error(`  Failed to promote "${evaluation.clean_title}":`, error.message);
    return null;
  }

  // Mark candidate as promoted
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

async function processQueue(force = false, modelOverride?: string) {
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

  // Fetch existing communities once for dedup across the whole batch
  const existingCommunities = await fetchExistingCommunities();
  console.log(`📦 Loaded ${existingCommunities.length} existing communities for duplicate detection.\n`);

  const counts = { promoted: 0, rejected: 0, evaluated: 0, skipped: 0, error: 0 };

  for (const c of candidates) {
    const result = await evaluateCandidate(c.id, force, existingCommunities, modelOverride);
    counts[result]++;

    // After promotion, add to existingCommunities so later candidates can dedup against it
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

    // Rate limit: ~0.5s between API calls
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n📊 Queue processing complete:`);
  console.log(`   ✅ Promoted:     ${counts.promoted}`);
  console.log(`   ❌ Rejected:     ${counts.rejected}`);
  console.log(`   🟡 Needs review: ${counts.evaluated}`);
  console.log(`   ⏭️  Skipped:      ${counts.skipped}`);
  console.log(`   💥 Errors:       ${counts.error}`);
}

async function evaluateSingleUrl(url: string, modelOverride?: string) {
  console.log(`🔍 Evaluating URL: ${url}\n`);

  // Try to find an existing candidate with this URL first
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
    const outcome = await evaluateCandidate(existing[0].id, true, undefined, modelOverride);
    console.log(`\nResult: ${outcome}`);
    return;
  }

  // Not found - insert as a new candidate and evaluate
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

  const outcome = await evaluateCandidate(candidateId, true, undefined, modelOverride);
  console.log(`\nResult: ${outcome}`);
}

// ─── Exported run function ───────────────────────────────────

export async function run(opts: { processQueue?: boolean; force?: boolean; url?: string; model?: string } = {}) {
  if (opts.processQueue) {
    await processQueue(opts.force || false, opts.model);
  } else if (opts.url) {
    await evaluateSingleUrl(opts.url, opts.model);
  } else {
    console.log('Community Evaluator: no action specified');
  }
}

// CLI entrypoint
if (process.argv[1]?.endsWith('/scripts/evaluate-community.ts')) {
  const args = process.argv.slice(2);
  const opts: Parameters<typeof run>[0] = {};

  if (args.includes('--process-queue')) {
    opts.processQueue = true;
    opts.force = args.includes('--force');
  } else if (args.includes('--url')) {
    opts.url = args[args.indexOf('--url') + 1];
  }

  run(opts).catch(err => {
    console.error('💥 Fatal:', err);
    process.exit(1);
  });
}
