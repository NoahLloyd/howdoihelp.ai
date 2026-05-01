/**
 * evaluate-stage1.ts - Stage 1 of the v2 evaluator (cheap text gate).
 *
 * Inputs: a URL plus the rich scrape of that URL. Outputs a verdict:
 *   - "reject"     — clearly not worth keeping (dead, off-topic, parked,
 *                    shell with no activity, NSFW, etc.)
 *   - "borderline" — looks plausible but needs a closer look (Stage 2 vision)
 *   - "accept"     — confidently keep
 *
 * Goals
 * -----
 * 1. Catch dead/parked/connection-refused without spending API credits.
 * 2. Run the surviving cases through Claude Haiku with the FULL page body so
 *    Claude can answer human-style questions: "Is this on-topic for AI
 *    safety? Is there recent activity? Are there obvious red flags?"
 * 3. Keep the prompt picky — the failure mode that broke production was the
 *    evaluator being too generous, so this prompt errs on rejecting when
 *    in doubt.
 */

import { callClaude } from './claude-call';
import type { RichScrape } from './scrape-rich';

const STAGE1_MODEL = process.env.STAGE1_MODEL || 'claude-haiku-4-5-20251001';
// Haiku 4.5 has a 200K context window; we keep this bounded but generous.
const MAX_HTML_CHARS_FOR_LLM = 20_000;
const MAX_TEXT_CHARS_FOR_LLM = 8_000;

const STAGE1_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['accept', 'borderline', 'reject'] },
    is_alive: { type: 'boolean' },
    is_on_topic: { type: 'boolean' },
    has_recent_activity: { type: 'boolean' },
    red_flags: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
  },
  required: ['verdict', 'is_alive', 'is_on_topic', 'has_recent_activity', 'red_flags', 'confidence', 'reasoning'],
};

export type Stage1Verdict = 'accept' | 'borderline' | 'reject';

export interface Stage1Result {
  verdict: Stage1Verdict;
  is_alive: boolean;
  is_on_topic: boolean;
  has_recent_activity: boolean;
  red_flags: string[];
  confidence: number;
  reasoning: string;
  /** Set when stage 1 short-circuited without calling the LLM. */
  shortCircuit?: 'network-error' | 'http-error' | 'parked-domain' | 'empty-body' | 'auth-walled';
}

// Hosts where the page is gated behind authentication, so we cannot see real
// content and an automated evaluator cannot meaningfully verify the resource.
// Policy: reject by default. A human can manually keep `enabled = true` in
// the resources table to override.
const AUTH_WALLED_HOSTS = new Set([
  'discord.gg', 'discord.com',
  't.me', 'telegram.me', 'telegram.org',
  'facebook.com', 'fb.com', 'fb.me',
  'x.com', 'twitter.com',
  'instagram.com',
  'linkedin.com',
  'slack.com',
  'snapchat.com',
  'tiktok.com',
  'whatsapp.com', 'chat.whatsapp.com',
  'signal.me',
]);

function isAuthWalled(host: string | undefined): boolean {
  if (!host) return false;
  if (AUTH_WALLED_HOSTS.has(host)) return true;
  for (const d of AUTH_WALLED_HOSTS) {
    if (host.endsWith('.' + d)) return true;
  }
  return false;
}

const PARKED_DOMAIN_SIGNALS = [
  'this domain is for sale',
  'buy this domain',
  'domain for sale',
  'parked free, courtesy of',
  'godaddy.com',
  'sedoparking',
  'hugedomains.com',
  'namecheap.com/parking',
  'namecheap parking',
  'register.com',
  'namesilo',
  'this web page is parked',
  'parked by',
];

function looksParked(scrape: RichScrape): boolean {
  const t = (scrape.textBody || '').toLowerCase();
  if (!t) return false;
  for (const sig of PARKED_DOMAIN_SIGNALS) {
    if (t.includes(sig)) return true;
  }
  // Very small body + "for sale" anywhere is a strong signal too
  if (scrape.textWordCount < 60 && /for sale/i.test(t) && /domain/i.test(t)) return true;
  return false;
}

function buildSystemPrompt(today: string): string {
  return `You are a careful, picky human volunteer reviewing a candidate URL for an AI-safety directory. The directory is shown to people who want to help reduce risks from advanced AI. Your job is to filter so they only see resources that are:

- ACTUALLY about AI safety / AI alignment / AI x-risk / pause AI / AI governance with a safety lens, AND
- Currently active and have something concrete for the user to do next.

TODAY'S DATE IS ${today}. Use this when judging whether dates are past or upcoming. Do NOT use your training cutoff date — use the date given here.

You are PICKY. When in doubt, reject. The directory loses trust if it shows dead links, parked domains, marketing webinars, or off-topic meetups.

Reject anything where any of these are true:
- The page is dead, parked, redirected to a junk site, or has no real content.
- The page is NSFW / adult / phishing / spam.
- The page is about AI but not safety: corporate AI governance training for businesses, AI ethics design workshops aimed at product teams, generic AI/ML conferences, AI for sales/marketing, "Human-AI Synergy for Business Growth", AI in management, AI for clinical trials oversight unless specifically about safety.
- The page is a general rationality / EA / ACX / book club / social meetup that does not specifically focus on AI safety.
- The page is a "shell" with no actual activity — e.g., "Coming Soon", "Loading events...", member counts of "0+", no upcoming dates, nothing actionable.
- For events: the event date is more than 2 weeks in the past relative to ${today}, or the page itself says "Past Event".
- For communities: there is no clear way to join, no recent posts, no member presence, or the most recent activity is older than ~2 years before ${today}.

Accept when the page is clearly:
- An active organisation, group, event, or campaign whose primary stated purpose is AI safety / alignment / x-risk reduction / pause AI / responsible AI governance for safety, AND
- Currently doing something. For events, the date is on or after ${today} and within roughly the next 12 months. For communities, there is recent activity, a real member base, or a clear way to join.

Date guidance:
- An event scheduled within the next 12 months from ${today} is FINE — that is current, not "too far in the future". Do not reject for being "1+ years away" unless it is more than ~12 months out.
- An event with no date AT ALL is borderline — push to vision check.
- An event with a date clearly in the past relative to ${today} is reject.

Use "borderline" only when the text alone genuinely cannot tell you (e.g., the site is heavily JavaScript-rendered and the body is mostly empty, or there is no date but the rest looks plausible). Otherwise commit to accept or reject.

Output ONLY a single JSON object, no prose, no markdown fences.

Schema:
{
  "verdict": "accept" | "borderline" | "reject",
  "is_alive": boolean,
  "is_on_topic": boolean,
  "has_recent_activity": boolean,
  "red_flags": string[],
  "confidence": number,
  "reasoning": string
}`;
}

function buildUserPrompt(args: {
  url: string;
  category: 'event' | 'community';
  scrape: RichScrape;
}): string {
  const { url, category, scrape } = args;
  const html = (scrape.html || '').slice(0, MAX_HTML_CHARS_FOR_LLM);
  const text = (scrape.textBody || '').slice(0, MAX_TEXT_CHARS_FOR_LLM);
  const ldStr = scrape.eventJsonLd ? JSON.stringify(scrape.eventJsonLd, null, 2).slice(0, 2000) : 'none';

  return `You are reviewing a candidate ${category.toUpperCase()} URL.

<candidate>
Requested URL: ${url}
Final URL after redirects: ${scrape.finalUrl}
Final host: ${scrape.finalHost}
HTTP status: ${scrape.status === null ? 'NETWORK ERROR' : scrape.status}
Network error: ${scrape.networkError || 'none'}
Content-Type: ${scrape.contentType || 'unknown'}
Redirected to a different host? ${scrape.redirected ? 'yes' : 'no'}
Visible word count after stripping: ${scrape.textWordCount}
og:title: ${scrape.title || 'none'}
og:description: ${scrape.description || 'none'}
</candidate>

<event_json_ld>
${ldStr}
</event_json_ld>

<page_visible_text>
${text || '[empty body]'}
</page_visible_text>

<page_html_excerpt>
${html || '[empty html]'}
</page_html_excerpt>

Return your JSON verdict now.`;
}

export async function evaluateStage1(args: {
  url: string;
  category: 'event' | 'community';
  scrape: RichScrape;
}): Promise<Stage1Result> {
  const { scrape } = args;

  // ─── Short-circuits (no LLM cost) ─────────────────────────

  if (scrape.networkError) {
    return {
      verdict: 'reject',
      is_alive: false,
      is_on_topic: false,
      has_recent_activity: false,
      red_flags: [`network error: ${scrape.networkError}`],
      confidence: 0.99,
      reasoning: `Site failed to load: ${scrape.networkError}.`,
      shortCircuit: 'network-error',
    };
  }

  if (scrape.status !== null && scrape.status >= 400) {
    return {
      verdict: 'reject',
      is_alive: false,
      is_on_topic: false,
      has_recent_activity: false,
      red_flags: [`HTTP ${scrape.status}`],
      confidence: 0.99,
      reasoning: `Site returned HTTP ${scrape.status}.`,
      shortCircuit: 'http-error',
    };
  }

  if (looksParked(scrape)) {
    return {
      verdict: 'reject',
      is_alive: false,
      is_on_topic: false,
      has_recent_activity: false,
      red_flags: ['parked / for-sale domain'],
      confidence: 0.95,
      reasoning: 'Page text matches parked-domain signals (for-sale page, registrar parking, etc.).',
      shortCircuit: 'parked-domain',
    };
  }

  if (isAuthWalled(scrape.finalHost)) {
    return {
      verdict: 'reject',
      is_alive: true,
      is_on_topic: false,
      has_recent_activity: false,
      red_flags: [`auth-walled host: ${scrape.finalHost} — content is gated, we cannot verify`],
      confidence: 1.0,
      reasoning: `${scrape.finalHost} is behind authentication. Automated evaluation cannot see the actual content (group activity, member discussions, posts). Default REJECT. To keep this URL in the directory, a human must manually mark it (set enabled=true in DB and accept that v2 cannot re-verify it).`,
      shortCircuit: 'auth-walled',
    };
  }

  if (scrape.textWordCount < 10 && !scrape.eventJsonLd) {
    return {
      verdict: 'reject',
      is_alive: false,
      is_on_topic: false,
      has_recent_activity: false,
      red_flags: ['empty / nearly-empty page body'],
      confidence: 0.9,
      reasoning: `Page has only ${scrape.textWordCount} visible words and no structured event data.`,
      shortCircuit: 'empty-body',
    };
  }

  // ─── LLM call ─────────────────────────────────────────────

  const userPrompt = buildUserPrompt(args);
  const today = new Date().toISOString().slice(0, 10);

  let parsed: any;
  try {
    const result = await callClaude<any>({
      model: STAGE1_MODEL,
      systemPrompt: buildSystemPrompt(today),
      userText: userPrompt,
      jsonSchema: STAGE1_OUTPUT_SCHEMA,
      toolDescription: 'Submit your stage 1 verdict for the candidate URL.',
    });
    parsed = result.structured;
  } catch (err: any) {
    return {
      verdict: 'borderline',
      is_alive: true,
      is_on_topic: false,
      has_recent_activity: false,
      red_flags: [`stage1: claude call failed: ${err?.message || String(err)}`],
      confidence: 0.3,
      reasoning: `Stage 1 call failed: ${err?.message || String(err)}`,
    };
  }

  const verdict: Stage1Verdict =
    parsed.verdict === 'accept' || parsed.verdict === 'reject' || parsed.verdict === 'borderline'
      ? parsed.verdict
      : 'borderline';

  return {
    verdict,
    is_alive: Boolean(parsed.is_alive),
    is_on_topic: Boolean(parsed.is_on_topic),
    has_recent_activity: Boolean(parsed.has_recent_activity),
    red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags.map(String) : [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    reasoning: String(parsed.reasoning || ''),
  };
}
