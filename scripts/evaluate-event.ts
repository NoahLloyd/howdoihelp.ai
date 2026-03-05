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

const SYSTEM_PROMPT = `You are an event evaluator for howdoihelp.ai, a directory that helps people find AI safety events near them. Your job is to determine whether a candidate event is real, relevant, and worth listing.

The site focuses on: AI safety, AI alignment, existential risk from AI, AI governance/policy, effective altruism (when AI-related), and responsible AI development.

You must return ONLY a valid JSON object with these exact fields:
{
  "is_real_event": boolean,       // Is this an event, fellowship, program, or opportunity? (NOT a blog post, product page, org homepage, etc.)
  "is_relevant": boolean,         // Is this related to AI safety, alignment, EA, existential risk, AI governance?
  "relevance_score": number,      // 0.0-1.0: How relevant to AI safety specifically
  "impact_score": number,         // 0.0-1.0: Expected impact/importance
  "suggested_ev": number,         // 0.0-1.0: Suggested expected-value ranking score
  "suggested_friction": number,   // 0.0-1.0: How hard is it to attend (0=one click, 1=major commitment)
  "event_type": string,           // See event_type options below
  "clean_title": string,          // Cleaned up, human-readable event title. Never use em dashes.
  "clean_description": string,    // 1-2 sentence description suitable for a directory listing. Never use em dashes.
  "event_date": string | null,    // Start date in ISO format (YYYY-MM-DD). Always extract this if possible.
  "event_end_date": string | null, // End date in ISO format (YYYY-MM-DD) if multi-day, otherwise null
  "event_time": string | null,    // Start time in "HH:MM" 24h format with timezone, e.g. "18:00 GMT", "14:00 PST". null if unknown.
  "location": string,             // ALWAYS standardize to "City, Country" for in-person events, or "Online" for virtual events. Never leave as "Unknown" if you can infer it.
  "is_online": boolean,           // true if this is a virtual/online event, false if in-person or hybrid
  "organization": string,         // The organizing body, e.g. "MATS", "BlueDot Impact", "EA London", "PauseAI". Use the most recognizable name.
  "duplicate_of": string | null,  // If this is a duplicate of an existing event, the ID of that event. null if not a duplicate.
  "reasoning": string             // 2-3 sentence explanation of your evaluation
}

event_type options:
- "conference" - multi-day conferences, summits
- "meetup" - local community meetups, socials, coffee chats
- "hackathon" - hackathons, alignment jams, build events
- "workshop" - hands-on workshops, bootcamps, training sessions
- "talk" - talks, lectures, presentations, panels
- "social" - casual socials, dinners, happy hours
- "course" - structured courses, reading groups, study groups
- "fellowship" - research fellowships, residencies (e.g. MATS, PIBBSS, Interact)
- "program" - structured programs, bootcamps, accelerators (e.g. BlueDot, AI Safety Camp)
- "other"

Scoring guidelines:
- relevance_score 0.9-1.0: Core AI safety (EAG, MATS, alignment workshops, AI safety camps)
- relevance_score 0.7-0.9: Strongly adjacent (EA events with AI tracks, AI governance conferences, rationalist meetups)
- relevance_score 0.5-0.7: Related (AI ethics events, tech policy, biosecurity with AI component)
- relevance_score 0.3-0.5: Tangential (general tech events that mention AI safety, career fairs with AI roles)
- relevance_score 0.0-0.3: Not relevant (pure ML/product events, crypto, unrelated conferences)

impact_score guidelines:
- 0.8-1.0: Major conferences (EAG, major alignment workshops, MATS cohort)
- 0.6-0.8: Significant events (regional conferences, hackathons, intensive workshops)
- 0.4-0.6: Solid community events (reading groups, talks by notable researchers, local meetups in large cities)
- 0.2-0.4: Small or routine events (regular coffee chats, casual socials)
- 0.0-0.2: Minimal impact

CRITICAL - Online event scoring:
This directory helps people find events IN THEIR LOCAL CITY. Online events have no location advantage and are rarely specifically relevant to any individual user. Therefore:
- Online events must be EXCEPTIONALLY noteworthy to get a high suggested_ev (e.g. a major virtual conference with top AI safety researchers, a MATS info session, an EAG virtual event)
- Routine online meetups, webinars, and generic virtual talks should get suggested_ev <= 0.15 regardless of relevance
- Only give an online event suggested_ev > 0.3 if it would be genuinely exciting for someone in the AI safety community regardless of where they live
- In-person events in a specific city are inherently more valuable for this directory

suggested_ev = roughly relevance_score * impact_score, but HEAVILY discount online events as described above.

friction guidelines:
- 0.0-0.1: Click a link, show up to a casual event
- 0.1-0.3: RSVP required, small time commitment
- 0.3-0.5: Application required, multi-day, or travel needed
- 0.5-0.8: Selective application, significant travel, multi-week commitment
- 0.8-1.0: Highly selective, life-changing commitment (fellowships, relocations)

Date/time/location formatting:
- ALWAYS extract and standardize the date, even if the source data is messy
- For location, ALWAYS use the format "City, Country" (e.g. "London, UK", "San Francisco, US", "Berlin, Germany")
- Never return "Unknown" for location if you can infer it from any available data (URL, description, org name, venue)
- For organization, use the most commonly recognized short name (e.g. "MATS" not "Machine Alignment Technical Safety program")

DUPLICATE DETECTION:
You may be given a list of existing events already in our database. If the candidate event is clearly the same event as one already listed - even if the title, URL, or description differs - set "duplicate_of" to the ID of the matching existing event.

Signs of a duplicate:
- Same event name/topic on the same date, possibly listed on different platforms (e.g. one on Eventbrite, one on Luma)
- Same organization hosting the same type of event at the same time and location
- Very similar descriptions for the same date/location, just worded differently

Set duplicate_of to null if this is NOT a duplicate. When in doubt, it is NOT a duplicate - only flag clear matches.`;

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
  let existingEventsBlock = '';
  if (existingEvents.length > 0) {
    const lines = existingEvents.map(e =>
      `[${e.id}] "${e.title}" | ${e.event_date || 'no date'} | ${e.location || 'unknown'} | ${e.organization || 'unknown'} | ${e.url}`
    );
    existingEventsBlock = `\n<existing_events>
Check if this candidate is a duplicate of any of these existing events. If so, set duplicate_of to the matching event's ID.

${lines.join('\n')}
</existing_events>\n`;
  }

  const userPrompt = `Evaluate this event candidate:

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
</scraped_page_content>
${existingEventsBlock}
Return ONLY a JSON object, no markdown fences, no explanation outside the JSON.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: userPrompt },
    ],
    system: SYSTEM_PROMPT,
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

  const { error } = await supabase.from('resources').insert({
    id: resourceId,
    title: evaluation.clean_title,
    description: evaluation.clean_description,
    url: candidate.url,
    source_org: evaluation.organization || candidate.source_org || candidate.source,
    category: 'events',
    location: evaluation.location || candidate.location || 'Global',
    min_minutes: 60,
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
