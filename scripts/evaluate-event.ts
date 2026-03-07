/**
 * evaluate-event.ts - The central AI event evaluator.
 *
 * This is the single gatekeeper for the entire event pipeline. Nothing enters
 * the public `resources` table without passing through this script.
 *
 * Usage:
 *   # Evaluate a single URL (creates candidate + evaluates + optionally promotes)
 *   npx tsx scripts/evaluate-event.ts --url "https://lu.ma/ai-safety-hackathon"
 *
 *   # Evaluate from title/description (no URL scraping)
 *   npx tsx scripts/evaluate-event.ts --title "AI Safety Unconference" --description "..." --date "2026-03-15"
 *
 *   # Process all pending candidates in the queue
 *   npx tsx scripts/evaluate-event.ts --process-queue
 *
 *   # Re-evaluate already-processed candidates
 *   npx tsx scripts/evaluate-event.ts --process-queue --force
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import Anthropic from '@anthropic-ai/sdk';
import { scrapeUrl } from './lib/scrape-url';
import { getSupabase, insertCandidates } from './lib/insert-candidates';
import { preFilter } from './lib/pre-filter';
import { estimateEventMinutes } from './lib/estimate-time';
import { getActivePrompt, interpolateTemplate } from '../src/lib/prompts';

// ─── Config ────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('❌ Missing ANTHROPIC_API_KEY in .env.local');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const supabase = getSupabase();

// Thresholds for auto-promote / auto-reject
const AUTO_PROMOTE_THRESHOLD = 0.6;
const AUTO_REJECT_THRESHOLD = 0.3;

// ─── AI Evaluation ─────────────────────────────────────────

interface AIEvaluation {
  is_real_event: boolean;
  is_relevant: boolean;
  relevance_score: number;
  impact_score: number;
  suggested_ev: number;
  suggested_friction: number;
  event_type: string;
  clean_title: string;
  clean_description: string;
  event_date: string | null;
  event_end_date: string | null;
  event_time: string | null;
  location: string;
  is_online: boolean;
  organization: string;
  duplicate_of: string | null;
  reasoning: string;
}

interface ExistingEvent {
  id: string;
  title: string;
  event_date: string | null;
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
    date?: string;
    location?: string;
    source?: string;
  },
  existingEvents: ExistingEvent[] = []
): Promise<AIEvaluation> {
  // Build template variables
  const scrapedTextVar = `Evaluate this event candidate:

<event>
Title: ${title}
URL: ${url}
Claimed date: ${metadata.date || 'Unknown'}
Claimed location: ${metadata.location || 'Unknown'}
Source platform: ${metadata.source || 'Unknown'}
Provided description: ${metadata.description || 'None'}
</event>

<scraped_page_content>
${scrapedText || '[Page could not be scraped]'}
</scraped_page_content>`;

  let existingEventsVar = '';
  if (existingEvents.length > 0) {
    const lines = existingEvents.map(e =>
      `[${e.id}] "${e.title}" | ${e.event_date || 'no date'} | ${e.location || 'unknown'} | ${e.organization || 'unknown'} | ${e.url}`
    );
    existingEventsVar = `<existing_events>
Check if this candidate is a duplicate of any of these existing events. If so, set duplicate_of to the matching event's ID.

${lines.join('\n')}
</existing_events>`;
  }

  const activePrompt = await getActivePrompt("evaluate-event");
  const fullPrompt = interpolateTemplate(activePrompt.content, {
    scraped_text: scrapedTextVar,
    existing_events: existingEventsVar,
  });

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
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
      is_real_event: Boolean(parsed.is_real_event),
      is_relevant: Boolean(parsed.is_relevant),
      relevance_score: clamp(Number(parsed.relevance_score) || 0),
      impact_score: clamp(Number(parsed.impact_score) || 0),
      suggested_ev: clamp(Number(parsed.suggested_ev) || 0),
      suggested_friction: clamp(Number(parsed.suggested_friction) || 0),
      event_type: parsed.event_type || 'other',
      clean_title: parsed.clean_title || title,
      clean_description: parsed.clean_description || '',
      event_date: parsed.event_date || null,
      event_end_date: parsed.event_end_date || null,
      event_time: parsed.event_time || null,
      location: parsed.location || 'Unknown',
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

// ─── Existing Events (for dedup) ────────────────────────────

async function fetchExistingEvents(): Promise<ExistingEvent[]> {
  const events: ExistingEvent[] = [];

  // Fetch live resources (promoted events)
  const { data: resources } = await supabase
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

  // Fetch already-evaluated/promoted candidates (not yet in resources, or recently processed)
  const { data: candidates } = await supabase
    .from('event_candidates')
    .select('id, title, event_date, location, ai_organization, url')
    .in('status', ['promoted', 'evaluated'])
    .limit(300);

  for (const c of candidates || []) {
    // Skip if we already have this ID from resources
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

// ─── Candidate Processing ──────────────────────────────────

async function evaluateCandidate(candidateId: string, force = false, existingEvents?: ExistingEvent[]): Promise<'promoted' | 'rejected' | 'evaluated' | 'skipped' | 'error'> {
  // Fetch the candidate
  const { data: candidate, error } = await supabase
    .from('event_candidates')
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
  let scrapedMeta: { date?: string; location?: string; description?: string } = {};

  if (!scrapedText && candidate.url) {
    const scraped = await scrapeUrl(candidate.url);
    scrapedText = scraped.text;
    scrapedMeta = {
      date: scraped.date || candidate.event_date,
      location: scraped.location || candidate.location,
      description: scraped.description || candidate.description,
    };

    // Save scraped text so we don't re-scrape
    await supabase
      .from('event_candidates')
      .update({ scraped_text: scrapedText })
      .eq('id', candidateId);
  } else {
    scrapedMeta = {
      date: candidate.event_date,
      location: candidate.location,
      description: candidate.description,
    };
  }

  // Step 2: Fetch existing events for dedup (reuse if provided)
  if (!existingEvents) {
    existingEvents = await fetchExistingEvents();
  }

  // Step 3: Call Claude for evaluation
  let evaluation: AIEvaluation;
  try {
    evaluation = await evaluateWithAI(
      candidate.title,
      candidate.url,
      scrapedText,
      { ...scrapedMeta, source: candidate.source },
      existingEvents
    );
  } catch (err: any) {
    console.error(`  AI evaluation failed for "${candidate.title}":`, err.message);
    return 'error';
  }

  // Step 4: Store AI results - always use AI's standardized date/location
  await supabase
    .from('event_candidates')
    .update({
      ai_is_real_event: evaluation.is_real_event,
      ai_is_relevant: evaluation.is_relevant,
      ai_relevance_score: evaluation.relevance_score,
      ai_impact_score: evaluation.impact_score,
      ai_suggested_ev: evaluation.suggested_ev,
      ai_suggested_friction: evaluation.suggested_friction,
      ai_event_type: evaluation.event_type,
      ai_summary: evaluation.clean_description,
      ai_reasoning: evaluation.reasoning,
      ai_organization: evaluation.organization,
      ai_is_online: evaluation.is_online,
      duplicate_of: evaluation.duplicate_of,
      processed_at: new Date().toISOString(),
      // Always prefer AI's standardized date/location over raw gatherer data
      event_date: evaluation.event_date || candidate.event_date,
      event_end_date: evaluation.event_end_date || candidate.event_end_date,
      event_time: evaluation.event_time,
      location: evaluation.location || candidate.location,
    })
    .eq('id', candidateId);

  // Step 5: Decide fate

  // Check for duplicate first
  if (evaluation.duplicate_of) {
    await supabase
      .from('event_candidates')
      .update({ status: 'rejected', ai_reasoning: `Duplicate of ${evaluation.duplicate_of}. ${evaluation.reasoning}` })
      .eq('id', candidateId);
    console.log(`  🔁 Duplicate: "${candidate.title}" → duplicate of ${evaluation.duplicate_of}`);
    return 'rejected';
  }

  if (!evaluation.is_real_event || !evaluation.is_relevant || evaluation.relevance_score < AUTO_REJECT_THRESHOLD) {
    await supabase
      .from('event_candidates')
      .update({ status: 'rejected' })
      .eq('id', candidateId);
    console.log(`  ❌ Rejected: "${candidate.title}" (real=${evaluation.is_real_event}, relevant=${evaluation.is_relevant}, score=${evaluation.relevance_score.toFixed(2)})`);
    return 'rejected';
  }

  if (evaluation.is_real_event && evaluation.is_relevant && evaluation.relevance_score >= AUTO_PROMOTE_THRESHOLD) {
    // Auto-promote
    const resourceId = await promoteToResources(candidateId, candidate, evaluation);
    if (resourceId) {
      console.log(`  ✅ Promoted: "${evaluation.clean_title}" (ev=${evaluation.suggested_ev.toFixed(2)}, relevance=${evaluation.relevance_score.toFixed(2)})`);
      return 'promoted';
    }
    return 'error';
  }

  // Borderline - needs admin review
  await supabase
    .from('event_candidates')
    .update({ status: 'evaluated' })
    .eq('id', candidateId);
  console.log(`  🟡 Needs review: "${candidate.title}" (relevance=${evaluation.relevance_score.toFixed(2)})`);
  return 'evaluated';
}

async function promoteToResources(
  candidateId: string,
  candidate: any,
  evaluation: AIEvaluation
): Promise<string | null> {
  const resourceId = `eval-${candidate.source}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Route fellowship/course/program types to the programs category
  const PROGRAM_EVENT_TYPES = ['fellowship', 'course', 'program'];
  const category = PROGRAM_EVENT_TYPES.includes(evaluation.event_type) ? 'programs' : 'events';

  const { error } = await supabase.from('resources').insert({
    id: resourceId,
    title: evaluation.clean_title,
    description: evaluation.clean_description,
    url: candidate.url,
    source_org: evaluation.organization || candidate.source_org || candidate.source,
    category,
    location: evaluation.location || candidate.location || 'Global',
    min_minutes: estimateEventMinutes(
      evaluation.event_type,
      evaluation.event_date || candidate.event_date,
      evaluation.event_end_date,
    ),
    ev_general: evaluation.suggested_ev,
    friction: evaluation.suggested_friction,
    enabled: true,
    status: 'approved',
    event_date: evaluation.event_date || candidate.event_date || null,
    event_end_date: evaluation.event_end_date || null,
    event_time: evaluation.event_time || null,
    event_type: evaluation.event_type,
    is_online: evaluation.is_online,
    activity_score: 0.9,
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
  await supabase
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

  const { data: candidates, error } = await supabase
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

  // Fetch full candidate data for pre-filtering
  const { data: fullCandidates } = await supabase
    .from('event_candidates')
    .select('id, title, description, source_org, url')
    .in('id', candidates.map(c => c.id));

  // Run pre-filter to reject obvious junk without using API credits
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

  // Auto-reject pre-filtered candidates in the database
  let prefilteredCount = 0;
  for (const r of prefiltered) {
    await supabase
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

  // Fetch existing events once for dedup across the whole batch
  const existingEvents = await fetchExistingEvents();
  console.log(`📦 Loaded ${existingEvents.length} existing events for duplicate detection.\n`);

  const counts = { promoted: 0, rejected: 0, evaluated: 0, skipped: 0, error: 0 };

  for (const c of toEvaluate) {
    const result = await evaluateCandidate(c.id, force, existingEvents);
    counts[result]++;

    // After promotion, add to existingEvents so later candidates can dedup against it
    if (result === 'promoted') {
      const { data: promoted } = await supabase
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

    // Rate limit: ~0.5s between API calls to be respectful
    await new Promise(r => setTimeout(r, 500));
  }

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

  // Try to find an existing candidate with this URL first
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  const pathname = new URL(url).pathname.replace(/\/+$/, '');

  const { data: existing } = await supabase
    .from('event_candidates')
    .select('id, title, status')
    .or(`url.ilike.%${hostname}${pathname}%,url.ilike.%${hostname}${pathname}`)
    .limit(1);

  if (existing?.[0]) {
    console.log(`Found existing candidate: "${existing[0].title}" (status: ${existing[0].status})`);
    console.log('Re-evaluating...\n');
    const outcome = await evaluateCandidate(existing[0].id, true);
    console.log(`\nResult: ${outcome}`);
    return;
  }

  // Not found - insert as a new candidate and evaluate
  console.log('No existing candidate found. Creating new entry...\n');

  const candidateId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await supabase.from('event_candidates').insert({
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

  const { data: recent } = await supabase
    .from('event_candidates')
    .select('id')
    .eq('source', 'manual')
    .order('created_at', { ascending: false })
    .limit(1);

  if (recent?.[0]) {
    const outcome = await evaluateCandidate(recent[0].id, true);
    console.log(`\nResult: ${outcome}`);
  }
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--process-queue')) {
    const force = args.includes('--force');
    await processQueue(force);
  } else if (args.includes('--url')) {
    const urlIdx = args.indexOf('--url');
    const url = args[urlIdx + 1];
    if (!url) {
      console.error('Usage: --url <URL>');
      process.exit(1);
    }
    await evaluateSingleUrl(url);
  } else if (args.includes('--title')) {
    const titleIdx = args.indexOf('--title');
    const title = args[titleIdx + 1];
    const descIdx = args.indexOf('--description');
    const description = descIdx >= 0 ? args[descIdx + 1] : undefined;
    const dateIdx = args.indexOf('--date');
    const date = dateIdx >= 0 ? args[dateIdx + 1] : undefined;
    if (!title) {
      console.error('Usage: --title <title> [--description <desc>] [--date <YYYY-MM-DD>]');
      process.exit(1);
    }
    await evaluateSingleDescription(title, description, date);
  } else {
    console.log(`Event Evaluator - The AI gatekeeper for howdoihelp.ai

Usage:
  npx tsx scripts/evaluate-event.ts --url <URL>
  npx tsx scripts/evaluate-event.ts --title <title> [--description <desc>] [--date <YYYY-MM-DD>]
  npx tsx scripts/evaluate-event.ts --process-queue [--force]
    `);
  }
}

main().catch(err => {
  console.error('💥 Fatal:', err);
  process.exit(1);
});
