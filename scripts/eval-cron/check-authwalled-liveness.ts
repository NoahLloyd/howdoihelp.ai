/**
 * check-authwalled-liveness.ts - Render each auth-walled URL (Discord,
 * Telegram, Facebook, WhatsApp, Slack, etc.) with Playwright and ask Claude
 * (on the user's subscription) whether the invite/page is LIVE or
 * EXPIRED/INVALID/CLOSED.
 *
 * The v2 reverify rejects auth-walled URLs by default because content is
 * gated. But many of those gated pages still render an "expired invite",
 * "group no longer exists", or "page not found" message that we CAN read.
 * This script catches those so we can disable just the dead ones, and trust
 * the rest as "still live, just not verifiable from the inside".
 *
 * Output: a Markdown report + JSON for downstream apply-disposition.
 *
 * Read-only on the database.
 *
 * Usage:
 *   npx tsx scripts/eval-cron/check-authwalled-liveness.ts
 *   npx tsx scripts/eval-cron/check-authwalled-liveness.ts --report <path>
 *   npx tsx scripts/eval-cron/check-authwalled-liveness.ts --limit 5  # smoke test
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { callClaude } from '../lib/claude-call';

interface AuthWalledRow {
  id: string | null;
  title: string;
  url: string;
  category: string;
  host: string;
}

interface LivenessResult {
  row: AuthWalledRow;
  classification: 'live' | 'dead' | 'unknown';
  confidence: number;
  reason: string;
  finalUrl: string;
  status: number | null;
  fetchError: string | null;
}

const REPORT_DIR = path.resolve(process.cwd(), '.context/eval-reports');
const SCREENSHOT_DIR = path.resolve(REPORT_DIR, 'authwalled-screenshots');
const CONCURRENCY = 4;

const VIEWPORT_W = 1280;
const VIEWPORT_H = 900;
const SCREENSHOT_MAX_H = 3000;
const PAGE_TIMEOUT_MS = 25_000;

// Sonnet is the proven path for vision in stage2; Haiku stumbles on
// "read this saved screenshot" via the CLI tool wrapper.
const MODEL = process.env.AUTHWALLED_MODEL || 'claude-sonnet-4-6';

const SCHEMA = {
  type: 'object',
  properties: {
    classification: { type: 'string', enum: ['live', 'dead', 'unknown'] },
    confidence: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['classification', 'confidence', 'reason'],
};

const SYSTEM_PROMPT = `You are checking whether an auth-walled invite link or social-platform page (Discord, Telegram, Facebook, Instagram, LinkedIn, Slack, WhatsApp, X/Twitter, etc.) is currently LIVE or DEAD.

You will receive: the URL, a screenshot of the rendered page, and the rendered text body. The page is auth-walled, so you typically WON'T see the actual group content. Your job is just to determine: did the invite/page successfully render its public preview, or does it explicitly show that the invite is expired / the group/page is deleted / the URL is invalid?

Return one of:
- "live"    : the page rendered a normal, intact preview/login wall/invite (with group name, member count, server icon, channel description, login form, etc.). The community/page itself appears to exist. We cannot verify activity, but the URL is functional.
- "dead"    : the page explicitly shows it is broken: "Invite Invalid", "Invite Expired", "This page is not available", "Sorry, this content isn't available right now", "Page not found", "404", "This group is no longer accessible", "Channel is private/unavailable", a generic platform error page, or an obvious "deleted" placeholder.
- "unknown" : you genuinely cannot tell — render failed, blank page, captcha challenge, geo-block, etc.

Be strict about "dead" — only mark dead when there is an explicit error/expired/invalid message. A normal auth wall ("Login to view this group") is "live". A loading screen that never resolved is "unknown", not dead.

Return ONLY the JSON object.

Schema:
{
  "classification": "live" | "dead" | "unknown",
  "confidence": number (0..1),
  "reason": string (one short sentence)
}`;

function parseArgs() {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--report');
  const li = args.indexOf('--limit');
  return {
    reportPath: ri >= 0 ? args[ri + 1] : undefined,
    limit: li >= 0 ? parseInt(args[li + 1] || '0', 10) || undefined : undefined,
  };
}

async function findLatestReport(): Promise<string> {
  const entries = await fs.readdir(REPORT_DIR);
  const reports = entries
    .filter(n => n.startsWith('reverify-') && n.endsWith('.md'))
    .sort();
  if (reports.length === 0) throw new Error(`No reverify-*.md found in ${REPORT_DIR}`);
  return path.join(REPORT_DIR, reports[reports.length - 1]);
}

function extractAuthWalled(reportText: string): AuthWalledRow[] {
  // Find the "## 🔒 Auth-walled rows" section.
  const startMatch = reportText.match(/^## 🔒 Auth-walled rows[^\n]*$/m);
  if (!startMatch) return [];
  const start = startMatch.index! + startMatch[0].length;
  const rest = reportText.slice(start);
  const endMatch = rest.match(/^## /m);
  const block = endMatch ? rest.slice(0, endMatch.index!) : rest;

  const parts = block.split(/^### 🔒 /m).slice(1);
  const rows: AuthWalledRow[] = [];

  for (const p of parts) {
    const titleEnd = p.indexOf('\n');
    const title = (titleEnd >= 0 ? p.slice(0, titleEnd) : p).trim();
    const urlMatch = p.match(/^- \*\*url\*\*: ?(\S+)/m);
    const idMatch = p.match(/^- \*\*id\*\*: ?`([^`]+)`/m);
    const catMatch = p.match(/^- \*\*category\*\*: ?(\S+)/m);
    const hostMatch = p.match(/^- \*\*host\*\*: ?(\S+)/m);
    if (!urlMatch) continue;

    rows.push({
      id: idMatch ? idMatch[1] : null,
      title,
      url: urlMatch[1],
      category: catMatch ? catMatch[1] : 'communities',
      host: hostMatch ? hostMatch[1] : '',
    });
  }
  return rows;
}

let _browser: Browser | null = null;
async function getBrowser(): Promise<Browser> {
  if (!_browser) {
    const opts: Parameters<typeof chromium.launch>[0] = { headless: true };
    if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) {
      opts.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
    }
    _browser = await chromium.launch(opts);
  }
  return _browser;
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close().catch(() => undefined);
    _browser = null;
  }
}

function safeName(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 80);
}

interface Render {
  screenshot: Buffer;
  text: string;
  finalUrl: string;
  status: number | null;
  error?: string;
}

async function render(url: string): Promise<Render> {
  const b = await getBrowser();
  const ctx = await b.newContext({
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  let status: number | null = null;
  try {
    const resp = await page.goto(url, { waitUntil: 'load', timeout: PAGE_TIMEOUT_MS });
    status = resp?.status() ?? null;
    // Discord/Telegram/etc. heavily client-render the invite preview. Give
    // them a generous beat to settle, then wait for networkidle as a bonus.
    await page.waitForTimeout(4500);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    const screenshot = await page.screenshot({
      clip: { x: 0, y: 0, width: VIEWPORT_W, height: SCREENSHOT_MAX_H },
      type: 'png',
    });
    const finalUrl = page.url();
    const text = (await page.evaluate(() => document.body?.innerText || '').catch(() => '')) || '';
    await ctx.close();
    return { screenshot, text, finalUrl, status };
  } catch (err: any) {
    await ctx.close().catch(() => undefined);
    return {
      screenshot: Buffer.alloc(0),
      text: '',
      finalUrl: url,
      status,
      error: err?.message || String(err),
    };
  }
}

async function classifyOne(row: AuthWalledRow): Promise<LivenessResult> {
  const r = await render(row.url);
  const screenshotPath = path.join(SCREENSHOT_DIR, `${safeName(row.url)}.png`);
  if (r.screenshot.length > 0) {
    await fs.writeFile(screenshotPath, r.screenshot).catch(() => undefined);
  }

  if (r.error || r.screenshot.length === 0) {
    // Render failed entirely. Could mean dead (network error, refused) or
    // could mean transient. Mark unknown unless clearly DNS/connect refused.
    const errLower = (r.error || '').toLowerCase();
    if (/econnrefused|dns|enotfound|net::err_name_not_resolved|net::err_connection_refused/.test(errLower)) {
      return {
        row,
        classification: 'dead',
        confidence: 0.95,
        reason: `Network error: ${r.error}`,
        finalUrl: r.finalUrl,
        status: r.status,
        fetchError: r.error || null,
      };
    }
    return {
      row,
      classification: 'unknown',
      confidence: 0.3,
      reason: `Render failed: ${r.error || 'empty screenshot'}`,
      finalUrl: r.finalUrl,
      status: r.status,
      fetchError: r.error || null,
    };
  }

  // HTTP 4xx/5xx: dead.
  if (r.status !== null && r.status >= 400) {
    return {
      row,
      classification: 'dead',
      confidence: 0.95,
      reason: `HTTP ${r.status}`,
      finalUrl: r.finalUrl,
      status: r.status,
      fetchError: null,
    };
  }

  // Ask Claude (via subscription) to look at the rendered screenshot + text.
  const userText = `URL: ${row.url}
Final URL after redirects: ${r.finalUrl}
HTTP status: ${r.status ?? 'unknown'}
Host: ${row.host}

Rendered text body (truncated):
${(r.text || '[empty]').slice(0, 3000)}

A screenshot of the rendered page is attached. Decide whether this auth-walled page is LIVE, DEAD, or UNKNOWN per the system prompt. Return JSON only.`;

  try {
    const result = await callClaude<{
      classification: 'live' | 'dead' | 'unknown';
      confidence: number;
      reason: string;
    }>({
      model: MODEL,
      systemPrompt: SYSTEM_PROMPT,
      userText,
      imageBytes: r.screenshot,
      jsonSchema: SCHEMA,
      toolDescription: 'Submit your liveness classification for the auth-walled URL.',
    });
    const v = result.structured;
    return {
      row,
      classification: v.classification === 'live' || v.classification === 'dead' ? v.classification : 'unknown',
      confidence: typeof v.confidence === 'number'
        ? Math.max(0, Math.min(1, v.confidence > 1 ? v.confidence / 100 : v.confidence))
        : 0.5,
      reason: String(v.reason || '').slice(0, 200),
      finalUrl: r.finalUrl,
      status: r.status,
      fetchError: null,
    };
  } catch (err: any) {
    return {
      row,
      classification: 'unknown',
      confidence: 0.2,
      reason: `Claude call failed: ${err?.message || String(err)}`,
      finalUrl: r.finalUrl,
      status: r.status,
      fetchError: err?.message || String(err),
    };
  }
}

async function processBatch(rows: AuthWalledRow[]): Promise<LivenessResult[]> {
  const results: LivenessResult[] = new Array(rows.length);
  let i = 0;
  let done = 0;
  async function worker(): Promise<void> {
    while (i < rows.length) {
      const idx = i++;
      const row = rows[idx];
      const result = await classifyOne(row);
      results[idx] = result;
      done++;
      const flag = result.classification === 'live' ? '✅' : result.classification === 'dead' ? '⚰️' : '❓';
      console.log(`[${done}/${rows.length}] ${flag} ${result.classification.padEnd(7)} ${row.url.slice(0, 80)}  (${result.reason.slice(0, 60)})`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker()));
  return results;
}

function buildReport(results: LivenessResult[], reportSource: string, now: Date): string {
  const counts = { live: 0, dead: 0, unknown: 0 };
  for (const r of results) counts[r.classification]++;

  const lines: string[] = [];
  lines.push(`# Auth-walled liveness check — ${now.toISOString()}`);
  lines.push('');
  lines.push(`Source report: \`${reportSource}\``);
  lines.push(`Model: \`${MODEL}\` via \`CLAUDE_PROVIDER=cli\` (Claude Code subscription).`);
  lines.push('');
  lines.push(`Checked **${results.length}** auth-walled URLs.`);
  lines.push('');
  lines.push(`- ✅ **live**: ${counts.live}  → keep enabled (page rendered intact, even if gated)`);
  lines.push(`- ⚰️ **dead**: ${counts.dead}  → disable (expired / invalid / 404 / etc.)`);
  lines.push(`- ❓ **unknown**: ${counts.unknown}  → flag for manual review (render failed, captcha, etc.)`);
  lines.push('');

  const sections: Array<['live' | 'dead' | 'unknown', string]> = [
    ['dead', '⚰️ Dead (recommend DISABLE)'],
    ['unknown', '❓ Unknown (flag for review)'],
    ['live', '✅ Live (recommend KEEP)'],
  ];
  for (const [bucket, header] of sections) {
    const rows = results.filter(r => r.classification === bucket);
    lines.push(`## ${header}  (${rows.length})`);
    lines.push('');
    if (rows.length === 0) {
      lines.push('_None._');
      lines.push('');
      continue;
    }
    lines.push('| classification | host | title | url | confidence | reason |');
    lines.push('|---|---|---|---|---|---|');
    rows.sort((a, b) => a.row.title.localeCompare(b.row.title));
    for (const r of rows) {
      const title = r.row.title.replace(/\|/g, '\\|').slice(0, 50);
      lines.push(`| ${r.classification} | ${r.row.host} | ${title} | ${r.row.url} | ${r.confidence.toFixed(2)} | ${r.reason.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  const { reportPath, limit } = parseArgs();
  const reportFile = reportPath ?? (await findLatestReport());
  console.log(`Source report: ${reportFile}`);

  const text = await fs.readFile(reportFile, 'utf8');
  let rows = extractAuthWalled(text);
  console.log(`Found ${rows.length} auth-walled rows.`);
  if (limit) {
    rows = rows.slice(0, limit);
    console.log(`Limited to first ${rows.length}.`);
  }

  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

  const results = await processBatch(rows);
  await closeBrowser();

  const counts = { live: 0, dead: 0, unknown: 0 };
  for (const r of results) counts[r.classification]++;

  console.log(`\nResult buckets:`);
  console.log(`  ✅ live:    ${counts.live}`);
  console.log(`  ⚰️ dead:    ${counts.dead}`);
  console.log(`  ❓ unknown: ${counts.unknown}`);

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-');
  const outMd = path.join(REPORT_DIR, `authwalled-liveness-${ts}.md`);
  await fs.writeFile(outMd, buildReport(results, reportFile, now));

  const outJson = outMd.replace(/\.md$/, '.json');
  await fs.writeFile(
    outJson,
    JSON.stringify(
      results.map(r => ({
        id: r.row.id,
        url: r.row.url,
        title: r.row.title,
        host: r.row.host,
        category: r.row.category,
        classification: r.classification,
        confidence: r.confidence,
        reason: r.reason,
        finalUrl: r.finalUrl,
        status: r.status,
      })),
      null,
      2,
    ),
  );

  console.log(`\n📝 Report:  ${outMd}`);
  console.log(`   JSON:   ${outJson}`);
}

main().catch(async err => {
  console.error('Fatal:', err);
  await closeBrowser();
  process.exit(1);
});
