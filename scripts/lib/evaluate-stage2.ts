/**
 * evaluate-stage2.ts - Stage 2 of the v2 evaluator (vision check).
 *
 * Renders the page in a real headless browser, takes a screenshot, then asks
 * Claude with vision: "if you opened this page as a human, would you put it
 * in an AI-safety directory?"
 *
 * Used for stage 1 borderlines (and any accept the caller wants double-
 * checked). The screenshot lets the model catch things text scraping misses:
 * "Loading events..." spinners that never resolve, NSFW imagery, parked
 * splash pages, broken layout, "no upcoming events" empty states, etc.
 */

import { chromium, type Browser } from 'playwright';
import { callClaude } from './claude-call';

const STAGE2_MODEL = process.env.STAGE2_MODEL || 'claude-sonnet-4-6';
// Total page height we capture in the screenshot. Most landing pages have all
// the useful info in the first ~4000px; longer than that and the vision input
// gets unwieldy.
const SCREENSHOT_MAX_HEIGHT = 4000;
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 900;
const PAGE_TIMEOUT_MS = 25_000;

const STAGE2_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['accept', 'reject'] },
    confidence: { type: 'number' },
    red_flags: { type: 'array', items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
  required: ['verdict', 'confidence', 'red_flags', 'reasoning'],
};

let _browser: Browser | null = null;
async function browser(): Promise<Browser> {
  if (!_browser) {
    _browser = await chromium.launch({ headless: true });
  }
  return _browser;
}

export async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

export type Stage2Verdict = 'accept' | 'reject';

export interface Stage2Result {
  verdict: Stage2Verdict;
  /** Confidence in [0,1]. */
  confidence: number;
  /** Short list of red flags the model spotted. */
  red_flags: string[];
  reasoning: string;
  /** Path to the screenshot we captured (for debugging benchmark runs). */
  screenshotPath?: string;
  /** Set if rendering failed and we had to give up. */
  renderError?: string;
}

function buildStage2SystemPrompt(today: string): string {
  return `You are a careful, picky human volunteer reviewing a candidate URL for an AI-safety directory. The directory is shown to people who want to help reduce risks from advanced AI. You are looking at a SCREENSHOT of the rendered page plus the rendered text.

TODAY'S DATE IS ${today}. Use this when judging whether dates are past or upcoming. Do NOT use your training cutoff. An event dated within the next ~12 months from ${today} is current; an event whose date is before ${today} is past.

You are PICKY. The directory loses trust if it shows dead links, parked domains, marketing webinars, off-topic meetups, "Coming Soon" placeholders, or NSFW content. If the page does not visibly demonstrate value to someone trying to help with AI safety, REJECT.

Reject when the screenshot shows any of:
- A parked or for-sale domain page.
- An adult / NSFW / spam / phishing splash.
- "Coming Soon", "Loading...", "0 events", "0 members", or other empty-state placeholders that suggest no real activity.
- An error page (404, 500, "this site can't be reached").
- A page that is about AI but not safety: corporate AI governance training, AI ethics design webinars, AI for business growth, AI for sales/marketing/management — even if the words "AI safety" appear somewhere.
- A general rationality / EA / book club / social meetup that doesn't centre AI safety.
- An event whose displayed date is clearly in the past relative to ${today}, or where the page says "Past Event", or where no date appears at all on a page that needs one.

Accept when the screenshot makes it visibly clear that:
- The page is about AI safety / alignment / x-risk / pause AI / responsible AI for safety, AND
- There is something concrete and active — a future date relative to ${today}, a recent post, a real member count, a working "join" or "register" CTA.

Output ONLY a single JSON object, no prose, no markdown fences.

Schema:
{
  "verdict": "accept" | "reject",
  "confidence": number,
  "red_flags": string[],
  "reasoning": string
}`;
}

interface RenderResult {
  screenshot: Buffer;
  renderedText: string;
  finalUrl: string;
  status: number | null;
  error?: string;
}

async function render(url: string): Promise<RenderResult> {
  const b = await browser();
  const ctx = await b.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  let status: number | null = null;
  try {
    const resp = await page.goto(url, { waitUntil: 'load', timeout: PAGE_TIMEOUT_MS });
    status = resp?.status() ?? null;
    // Give SPAs a beat to settle.
    await page.waitForTimeout(1500);
    // Always clip to a fixed viewport-style window. Full-page screenshots can
    // exceed Anthropic's 8000px image-dimension cap; landing pages also
    // generally show all the useful "is this real / active / on-topic"
    // signals within the first few screenfuls.
    const screenshot = await page.screenshot({
      clip: { x: 0, y: 0, width: VIEWPORT_WIDTH, height: SCREENSHOT_MAX_HEIGHT },
      type: 'png',
    });
    const finalUrl = page.url();
    const renderedText = (await page.evaluate(() => document.body?.innerText || '').catch(() => '')) || '';

    await ctx.close();
    return { screenshot, renderedText, finalUrl, status };
  } catch (err: any) {
    await ctx.close().catch(() => undefined);
    return {
      screenshot: Buffer.alloc(0),
      renderedText: '',
      finalUrl: url,
      status,
      error: err?.message || String(err),
    };
  }
}

export async function evaluateStage2(args: {
  url: string;
  category: 'event' | 'community';
  /** When set, the screenshot will be saved here for debugging. */
  saveScreenshotTo?: string;
}): Promise<Stage2Result> {
  const r = await render(args.url);

  if (r.error || r.screenshot.length === 0) {
    return {
      verdict: 'reject',
      confidence: 0.95,
      red_flags: [`render failed: ${r.error || 'no screenshot'}`],
      reasoning: `Could not render the page in headless browser: ${r.error || 'no screenshot produced'}.`,
      renderError: r.error || 'no screenshot',
    };
  }

  if (args.saveScreenshotTo) {
    const fs = await import('node:fs/promises');
    await fs.writeFile(args.saveScreenshotTo, r.screenshot);
  }

  const userText = `You are reviewing a candidate ${args.category.toUpperCase()} URL.

Requested URL: ${args.url}
Final URL after redirects: ${r.finalUrl}
HTTP status: ${r.status ?? 'unknown'}

Rendered text (truncated):
${(r.renderedText || '[empty]').slice(0, 4000)}

A screenshot of the rendered page is attached. Make your verdict based on what a human would see opening this page right now.

Return your JSON verdict.`;

  const today = new Date().toISOString().slice(0, 10);

  let v: Record<string, unknown>;
  try {
    const result = await callClaude<Record<string, unknown>>({
      model: STAGE2_MODEL,
      systemPrompt: buildStage2SystemPrompt(today),
      userText,
      imageBytes: r.screenshot,
      jsonSchema: STAGE2_OUTPUT_SCHEMA,
      toolDescription: 'Submit your final accept/reject verdict for the candidate URL.',
    });
    v = result.structured;
  } catch (err: any) {
    return {
      verdict: 'reject',
      confidence: 0.3,
      red_flags: [`stage2: claude call failed: ${err?.message || String(err)}`],
      reasoning: `Stage 2 call failed: ${err?.message || String(err)}`,
      screenshotPath: args.saveScreenshotTo,
    };
  }

  const verdict = v.verdict === 'accept' ? 'accept' : 'reject';
  // Normalize confidence: model sometimes returns 0-100 instead of 0-1.
  let confidence = typeof v.confidence === 'number' ? v.confidence : 0.5;
  if (confidence > 1) confidence = confidence / 100;
  if (confidence < 0) confidence = 0;
  if (confidence > 1) confidence = 1;

  return {
    verdict,
    confidence,
    red_flags: Array.isArray(v.red_flags) ? (v.red_flags as unknown[]).map(String) : [],
    reasoning: String(v.reasoning || ''),
    screenshotPath: args.saveScreenshotTo,
  };
}
