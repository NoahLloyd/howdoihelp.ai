/**
 * evaluate-candidate-metadata.ts - Extracts the rich display + ranking metadata
 * for a candidate that has ALREADY been judged "accept" by the v2 pipeline.
 *
 * v2 (evaluate-pipeline.ts) is the gatekeeper. It returns accept/reject with
 * reasoning, but it does not produce things like clean_title, suggested_ev,
 * duplicate_of, event_date in canonical format, etc. — fields the directory
 * needs in order to rank, dedupe, and display the resource.
 *
 * This module fills that gap. It runs ONE Claude call via the subscription
 * CLI path (no API costs) on the same scrape that v2 already produced, with
 * a non-gatekeeping prompt: "this has already been approved, just give me
 * clean structured metadata".
 */

import { callClaude } from './claude-call';
import type { RichScrape } from './scrape-rich';

// ─── Shared types ──────────────────────────────────────────────

export interface ExistingCandidate {
  id: string;
  title: string;
  url: string;
  organization?: string | null;
  location?: string | null;
  /** events only */
  event_date?: string | null;
}

export interface CommunityMetadata {
  clean_title: string;
  clean_description: string;
  clean_location: string;
  is_online: boolean;
  community_type:
    | 'discord' | 'meetup' | 'facebook-group' | 'slack' | 'telegram'
    | 'whatsapp' | 'forum-group' | 'website' | 'mailing-list'
    | 'subreddit' | 'linkedin' | 'other';
  organization: string;
  suggested_ev: number;
  suggested_friction: number;
  duplicate_of: string | null;
  reasoning: string;
}

export interface EventMetadata {
  clean_title: string;
  clean_description: string;
  event_date: string | null;     // YYYY-MM-DD canonical
  event_end_date: string | null; // YYYY-MM-DD or null for single-day
  event_time: string | null;     // HH:MM local or null
  location: string;
  is_online: boolean;
  event_type:
    | 'talk' | 'workshop' | 'hackathon' | 'conference' | 'meetup'
    | 'fellowship' | 'course' | 'program' | 'reading-group' | 'other';
  organization: string;
  suggested_ev: number;
  suggested_friction: number;
  impact_score: number;
  duplicate_of: string | null;
  reasoning: string;
}

const METADATA_MODEL = process.env.METADATA_MODEL || 'claude-sonnet-4-6';

// ─── Schemas ───────────────────────────────────────────────────

const COMMUNITY_SCHEMA = {
  type: 'object',
  properties: {
    clean_title: { type: 'string' },
    clean_description: { type: 'string' },
    clean_location: { type: 'string' },
    is_online: { type: 'boolean' },
    community_type: {
      type: 'string',
      enum: ['discord', 'meetup', 'facebook-group', 'slack', 'telegram',
             'whatsapp', 'forum-group', 'website', 'mailing-list',
             'subreddit', 'linkedin', 'other'],
    },
    organization: { type: 'string' },
    suggested_ev: { type: 'number' },
    suggested_friction: { type: 'number' },
    duplicate_of: { type: ['string', 'null'] },
    reasoning: { type: 'string' },
  },
  required: ['clean_title', 'clean_description', 'clean_location', 'is_online',
             'community_type', 'organization', 'suggested_ev',
             'suggested_friction', 'duplicate_of', 'reasoning'],
};

const EVENT_SCHEMA = {
  type: 'object',
  properties: {
    clean_title: { type: 'string' },
    clean_description: { type: 'string' },
    event_date: { type: ['string', 'null'] },
    event_end_date: { type: ['string', 'null'] },
    event_time: { type: ['string', 'null'] },
    location: { type: 'string' },
    is_online: { type: 'boolean' },
    event_type: {
      type: 'string',
      enum: ['talk', 'workshop', 'hackathon', 'conference', 'meetup',
             'fellowship', 'course', 'program', 'reading-group', 'other'],
    },
    organization: { type: 'string' },
    suggested_ev: { type: 'number' },
    suggested_friction: { type: 'number' },
    impact_score: { type: 'number' },
    duplicate_of: { type: ['string', 'null'] },
    reasoning: { type: 'string' },
  },
  required: ['clean_title', 'clean_description', 'event_date', 'event_end_date',
             'event_time', 'location', 'is_online', 'event_type',
             'organization', 'suggested_ev', 'suggested_friction',
             'impact_score', 'duplicate_of', 'reasoning'],
};

// ─── Prompt builders ───────────────────────────────────────────

const BASE_INSTRUCTION = `You are extracting clean metadata for an AI-safety directory listing.

A separate gatekeeping pipeline has ALREADY judged this URL "accept" — do not re-litigate that. Your only job is to produce clean, accurate, structured metadata that the directory needs to display and rank the resource.

Be concise. Be precise. Standardize formats. Detect duplicates against the provided list.

Return ONLY a single JSON object, no prose, no markdown fences.`;

const COMMUNITY_INSTRUCTION = `${BASE_INSTRUCTION}

Field guidance:
- clean_title: the human-readable name of the community (e.g. "EA Berlin", "AI Safety Tübingen"). Strip site-name suffixes ("| EA Forum"). Title-case city names.
- clean_description: 1-2 sentences in plain English. What the community does and who it's for. No marketing fluff. No URLs.
- clean_location: "City, Country" for local groups (e.g. "Berlin, Germany"). "Online" for virtual-only. Never "Global".
- is_online: true if purely online/virtual; false if it has in-person meetups (even if mostly online).
- community_type: pick the one that fits the URL/host best.
- organization: the most recognizable parent name (e.g. "PauseAI", "EA Forum", "LessWrong", "MATS"). Empty string if the community is its own org.
- suggested_ev (0..1): how valuable showing this is to a user looking to engage with AI safety. Higher for active dedicated AI-safety communities; lower for tangential or low-activity.
- suggested_friction (0..1): how hard to join. 0=click and you're in (open Discord). 0.3=create an account / request to join. 0.6=application or approval. 0.9=invite-only/selective.
- duplicate_of: the ID of an existing entry in the list if this is the same community, otherwise null. Same group via different URLs (Discord + Meetup for same chapter) IS a duplicate. Different chapters of the same org (EA London vs. EA Berlin) are NOT duplicates.
- reasoning: 1-2 sentences explaining your choices. No fluff.

Schema:
{
  "clean_title": string, "clean_description": string, "clean_location": string,
  "is_online": boolean, "community_type": string, "organization": string,
  "suggested_ev": number, "suggested_friction": number,
  "duplicate_of": string|null, "reasoning": string
}`;

const EVENT_INSTRUCTION = `${BASE_INSTRUCTION}

Field guidance:
- clean_title: human-readable event name. Strip site suffixes.
- clean_description: 1-2 sentences. What the event is and who should attend. No marketing fluff.
- event_date: YYYY-MM-DD canonical date. Use TODAY'S DATE for relative resolution. Null if no date is available.
- event_end_date: YYYY-MM-DD if multi-day, otherwise null.
- event_time: HH:MM in 24-hour local format if visible, otherwise null.
- location: "City, Country" or "Online". Use the venue city, not the platform host.
- is_online: true if attendable purely online.
- event_type: pick best fit. "fellowship"/"course"/"program" route to programs category, others to events.
- organization: hosting org's most recognizable name.
- suggested_ev (0..1): expected value of attending for a typical AI-safety-curious user. Higher for hands-on (workshops, hackathons) than passive (talks).
- suggested_friction (0..1): 0 for free open events, higher for application required, ticket cost, travel, etc.
- impact_score (0..1): how impactful this event is for the AI safety field. Higher for major conferences, well-known speakers, coalition events.
- duplicate_of: ID from the existing list if same event, else null. Same event posted on multiple platforms (EA Forum + Luma) IS a duplicate.
- reasoning: 1-2 sentences.

Schema:
{
  "clean_title": string, "clean_description": string,
  "event_date": string|null, "event_end_date": string|null, "event_time": string|null,
  "location": string, "is_online": boolean, "event_type": string,
  "organization": string, "suggested_ev": number, "suggested_friction": number,
  "impact_score": number, "duplicate_of": string|null, "reasoning": string
}`;

function buildExistingBlock(existing: ExistingCandidate[], category: 'event' | 'community'): string {
  if (existing.length === 0) return '';
  const lines = existing.slice(0, 200).map(e => {
    const parts = [`[${e.id}]`, `"${e.title}"`];
    if (category === 'event' && e.event_date) parts.push(e.event_date);
    if (e.location) parts.push(e.location);
    if (e.organization) parts.push(e.organization);
    parts.push(e.url);
    return parts.join(' | ');
  });
  return `\n<existing_entries>\nDeduplicate against this list — set duplicate_of to a matching ID if applicable, otherwise null.\n\n${lines.join('\n')}\n</existing_entries>\n`;
}

function buildUserPrompt(args: {
  category: 'event' | 'community';
  url: string;
  scrape: RichScrape;
  candidate: { title?: string; description?: string; date?: string; location?: string; source?: string };
  existing: ExistingCandidate[];
}): string {
  const { category, url, scrape, candidate, existing } = args;
  const today = new Date().toISOString().slice(0, 10);
  const text = (scrape.textBody || '').slice(0, 8000);
  const ld = scrape.eventJsonLd ? JSON.stringify(scrape.eventJsonLd, null, 2).slice(0, 1500) : 'none';

  return `Today's date: ${today}

Extract metadata for this ${category} candidate (already approved by gate):

<candidate>
Source-provided title: ${candidate.title || '(none)'}
Source-provided description: ${candidate.description || '(none)'}
${category === 'event' ? `Source-provided date: ${candidate.date || '(none)'}\n` : ''}Source-provided location: ${candidate.location || '(none)'}
Source platform: ${candidate.source || '(none)'}
URL: ${url}
Final URL: ${scrape.finalUrl}
Final host: ${scrape.finalHost}
og:title: ${scrape.title || '(none)'}
og:description: ${scrape.description || '(none)'}
</candidate>

<event_json_ld>
${ld}
</event_json_ld>

<page_visible_text>
${text || '(empty)'}
</page_visible_text>
${buildExistingBlock(existing, category)}
Return your JSON now.`;
}

// ─── Public API ────────────────────────────────────────────────

export async function extractCommunityMetadata(args: {
  url: string;
  scrape: RichScrape;
  candidate: { title?: string; description?: string; location?: string; source?: string };
  existing: ExistingCandidate[];
}): Promise<CommunityMetadata> {
  const userText = buildUserPrompt({ ...args, category: 'community' });
  const result = await callClaude<CommunityMetadata>({
    model: METADATA_MODEL,
    systemPrompt: COMMUNITY_INSTRUCTION,
    userText,
    jsonSchema: COMMUNITY_SCHEMA,
    toolDescription: 'Submit the cleaned community metadata for the candidate.',
  });
  const v = result.structured;
  return {
    clean_title: String(v.clean_title || args.candidate.title || ''),
    clean_description: String(v.clean_description || ''),
    clean_location: String(v.clean_location || 'Unknown'),
    is_online: Boolean(v.is_online),
    community_type: (v.community_type || 'other') as CommunityMetadata['community_type'],
    organization: String(v.organization || ''),
    suggested_ev: clamp(v.suggested_ev),
    suggested_friction: clamp(v.suggested_friction),
    duplicate_of: v.duplicate_of ?? null,
    reasoning: String(v.reasoning || ''),
  };
}

export async function extractEventMetadata(args: {
  url: string;
  scrape: RichScrape;
  candidate: { title?: string; description?: string; date?: string; location?: string; source?: string };
  existing: ExistingCandidate[];
}): Promise<EventMetadata> {
  const userText = buildUserPrompt({ ...args, category: 'event' });
  const result = await callClaude<EventMetadata>({
    model: METADATA_MODEL,
    systemPrompt: EVENT_INSTRUCTION,
    userText,
    jsonSchema: EVENT_SCHEMA,
    toolDescription: 'Submit the cleaned event metadata for the candidate.',
  });
  const v = result.structured;
  return {
    clean_title: String(v.clean_title || args.candidate.title || ''),
    clean_description: String(v.clean_description || ''),
    event_date: v.event_date || null,
    event_end_date: v.event_end_date || null,
    event_time: v.event_time || null,
    location: String(v.location || 'Unknown'),
    is_online: Boolean(v.is_online),
    event_type: (v.event_type || 'other') as EventMetadata['event_type'],
    organization: String(v.organization || ''),
    suggested_ev: clamp(v.suggested_ev),
    suggested_friction: clamp(v.suggested_friction),
    impact_score: clamp(v.impact_score),
    duplicate_of: v.duplicate_of ?? null,
    reasoning: String(v.reasoning || ''),
  };
}

function clamp(n: unknown): number {
  const x = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(x)) return 0.5;
  if (x < 0) return 0;
  if (x > 1) return Math.min(1, x > 1.5 ? x / 100 : x);
  return x;
}
