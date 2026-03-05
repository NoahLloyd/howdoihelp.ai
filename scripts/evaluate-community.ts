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

// ─── Config ────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('❌ Missing ANTHROPIC_API_KEY in .env.local');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const supabase = getSupabase();

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

const SYSTEM_PROMPT = `You are a community evaluator for howdoihelp.ai, a directory that helps people find AI safety communities and groups near them. Your job is to determine whether a candidate community is real, relevant, active, and worth listing.

The site focuses on: AI safety, AI alignment, existential risk from AI, AI governance/policy, effective altruism, rationality, and responsible AI development.

You must return ONLY a valid JSON object with these exact fields:
{
  "is_real_community": boolean,       // Is this an actual community, group, or organization people can join? (NOT a blog, product page, news article, course, individual's profile, etc.)
  "is_relevant": boolean,             // Is this related to AI safety, alignment, EA, existential risk, AI governance, rationality?
  "relevance_score": number,          // 0.0-1.0: How relevant to AI safety specifically
  "quality_score": number,            // 0.0-1.0: How active, well-organized, and useful is this community
  "suggested_ev": number,             // 0.0-1.0: Overall expected value of listing this community
  "suggested_friction": number,       // 0.0-1.0: How hard is it to join (0=one click, 1=application+selective)
  "community_type": string,           // See community_type options below
  "clean_title": string,              // Cleaned up, human-readable community name. Never use em dashes.
  "clean_description": string,        // 1-2 sentence description suitable for a directory listing. Be specific about what the community does and who it's for. Never use em dashes.
  "clean_location": string,           // Standardized: "City, Country" for local groups, or "Online" for virtual communities
  "is_online": boolean,               // true if this is a purely online/virtual community, false if it has in-person meetups
  "organization": string,             // The parent organization, e.g. "EA Forum", "PauseAI", "LessWrong". Use the most recognizable name.
  "duplicate_of": string | null,      // If this is a duplicate of an existing community, the ID of that community. null if not a duplicate.
  "reasoning": string                 // 2-3 sentence explanation of your evaluation
}

community_type options:
- "discord" - Discord servers
- "meetup" - Meetup.com groups or regular in-person meetups
- "facebook-group" - Facebook groups
- "slack" - Slack workspaces
- "telegram" - Telegram groups/channels
- "whatsapp" - WhatsApp groups
- "forum-group" - Forum-hosted local group pages (EA Forum, LessWrong)
- "website" - Standalone website for a community/organization
- "mailing-list" - Email lists, newsletters
- "subreddit" - Reddit communities
- "linkedin" - LinkedIn groups
- "other"

Scoring guidelines:

relevance_score:
- 0.9-1.0: Core AI safety community (alignment research groups, MATS alumni, AI safety reading groups)
- 0.7-0.9: Strongly adjacent (EA groups, rationality groups, AI governance networks)
- 0.5-0.7: Related (tech policy groups, biosecurity communities with AI component)
- 0.3-0.5: Tangential (general EA groups without AI focus, tech communities that discuss AI safety occasionally)
- 0.0-0.3: Not relevant (general tech groups, crypto, unrelated)

quality_score:
- 0.8-1.0: Large, active community with regular events, hundreds of members, strong content
- 0.6-0.8: Active community with regular meetups or discussions, clear purpose
- 0.4-0.6: Moderately active, some regular activity, decent description and structure
- 0.2-0.4: Low activity signals, sparse description, unclear if still active
- 0.0-0.2: Likely dead, empty, or barely functional

Quality signals to look for:
- Platform type: Discord/Slack/Meetup = likely more active than a bare forum page
- Description quality: Well-written, specific descriptions suggest active curation
- Member counts or event counts if visible
- Recent activity dates if visible
- Whether the link actually goes to a joinable community vs. a dead page

suggested_ev = roughly relevance_score * quality_score, but:
- Boost local in-person communities (they're harder to find and more valuable for connection)
- Discount generic online communities that provide little unique value
- Boost communities with clear, specific focus areas

friction guidelines:
- 0.0-0.1: Click a link and you're in (open Discord, public Meetup)
- 0.1-0.3: Need to request to join or create an account
- 0.3-0.5: Application or approval required
- 0.5-0.8: Selective admission, interview, or significant barrier
- 0.8-1.0: Highly exclusive, invitation only

Location formatting:
- For local groups, ALWAYS use "City, Country" format (e.g. "London, UK", "San Francisco, US")
- For online-only communities, use "Online"
- Never return "Global" unless it's truly a global organization with no specific location
- Infer location from the community name, description, or URL when possible (e.g. "EA London" → "London, UK")

DUPLICATE DETECTION:
You may be given a list of existing communities already in our database. If the candidate is clearly the same community as one already listed - even if the URL or name differs slightly - set "duplicate_of" to the ID of the matching existing community.

Signs of a duplicate:
- Same group name appearing under different platform links (e.g. Discord + Meetup for the same EA city group)
- Same location group from different scraped sources
- Very similar names for the same city (e.g. "EA Berlin" and "Effective Altruism Berlin")

Set duplicate_of to null if this is NOT a duplicate. When in doubt, it is NOT a duplicate.`;

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
  existingCommunities: ExistingCommunity[] = []
): Promise<AIEvaluation> {
  let existingBlock = '';
  if (existingCommunities.length > 0) {
    const lines = existingCommunities.map(e =>
      `[${e.id}] "${e.title}" | ${e.location || 'unknown'} | ${e.organization || 'unknown'} | ${e.url}`
    );
    existingBlock = `\n<existing_communities>
Check if this candidate is a duplicate of any of these existing communities. If so, set duplicate_of to the matching community's ID.

${lines.join('\n')}
</existing_communities>\n`;
  }

  const userPrompt = `Evaluate this community candidate:

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
</scraped_page_content>
${existingBlock}
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
  const { data: resources } = await supabase
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
  const { data: candidates } = await supabase
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

async function evaluateCandidate(candidateId: string, force = false, existingCommunities?: ExistingCommunity[]): Promise<'promoted' | 'rejected' | 'evaluated' | 'skipped' | 'error'> {
  // Fetch the candidate
  const { data: candidate, error } = await supabase
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
    await supabase
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
      existingCommunities
    );
  } catch (err: any) {
    console.error(`  AI evaluation failed for "${candidate.title}":`, err.message);
    return 'error';
  }

  // Step 4: Store AI results
  await supabase
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
    await supabase
      .from('community_candidates')
      .update({ status: 'rejected', ai_reasoning: `Duplicate of ${evaluation.duplicate_of}. ${evaluation.reasoning}` })
      .eq('id', candidateId);
    console.log(`  🔁 Duplicate: "${candidate.title}" → duplicate of ${evaluation.duplicate_of}`);
    return 'rejected';
  }

  if (!evaluation.is_real_community || !evaluation.is_relevant ||
      evaluation.relevance_score < AUTO_REJECT_RELEVANCE || evaluation.quality_score < AUTO_REJECT_QUALITY) {
    await supabase
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
  await supabase
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

  const { error } = await supabase.from('resources').insert({
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
  await supabase
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

  const { data: candidates, error } = await supabase
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
    const result = await evaluateCandidate(c.id, force, existingCommunities);
    counts[result]++;

    // After promotion, add to existingCommunities so later candidates can dedup against it
    if (result === 'promoted') {
      const { data: promoted } = await supabase
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

async function evaluateSingleUrl(url: string) {
  console.log(`🔍 Evaluating URL: ${url}\n`);

  // Try to find an existing candidate with this URL first
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  const pathname = new URL(url).pathname.replace(/\/+$/, '');

  const { data: existing } = await supabase
    .from('community_candidates')
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

  const candidateId = `manual-comm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await supabase.from('community_candidates').insert({
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
  } else {
    console.log(`Community Evaluator - The AI gatekeeper for howdoihelp.ai communities

Usage:
  npx tsx scripts/evaluate-community.ts --url <URL>
  npx tsx scripts/evaluate-community.ts --process-queue [--force]
    `);
  }
}

main().catch(err => {
  console.error('💥 Fatal:', err);
  process.exit(1);
});
