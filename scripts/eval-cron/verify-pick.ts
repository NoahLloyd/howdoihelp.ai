/**
 * verify-pick.ts - Run a hand-picked list of URLs through the v2 pipeline
 * and emit a Markdown verification checklist.
 *
 * The point: give Noah a quick "scan and tick" view of 20-ish URLs covering
 * the spectrum (known-good, known-bad, edge cases). For each one, the
 * checklist shows the URL, the v2 verdict, the model's reasoning, and a
 * yes/no question — so Noah can verify in minutes whether the pipeline is
 * making the calls a human would.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { evaluatePipeline, type PipelineResult } from '../lib/evaluate-pipeline';
import { closeBrowser } from '../lib/evaluate-stage2';

interface Pick {
  url: string;
  category: 'event' | 'community';
  bucket: string; // free-form; e.g. "promoted-good", "promoted-questionable", "edge-case"
  expectedHint?: 'accept' | 'reject';  // my guess; informational only
  note: string;
}

// 20 picks across buckets — chosen so a human can scan and ratify quickly.
const PICKS: Pick[] = [
  // ─── Currently promoted; expected to stay promoted ─────
  { url: 'https://moxsf.com',                                       category: 'community', bucket: 'promoted-keep',    expectedHint: 'accept', note: 'Mox SF — active AI-safety hub coworking.' },
  { url: 'https://bluedot.org',                                     category: 'community', bucket: 'promoted-keep',    expectedHint: 'accept', note: 'BlueDot Impact — major AI safety org.' },
  { url: 'https://stoptherace.ai',                                  category: 'community', bucket: 'promoted-keep',    expectedHint: 'accept', note: 'Stop The Race — pause-AI campaign with upcoming march.' },
  { url: 'https://lu.ma/9bmte6qy',                                  category: 'event',     bucket: 'event-keep',       expectedHint: 'accept', note: 'AI Safety Awareness Project NYC workshop, May 2 2026.' },
  { url: 'https://luma.com/ais-contenthack',                        category: 'event',     bucket: 'event-keep',       expectedHint: 'accept', note: 'BlueDot AI Risk Content Hackathon, June 6 2026.' },

  // ─── Currently promoted; expected to be removed ────────
  { url: 'https://forum.effectivealtruism.org/groups/9pKEJJbqqNPHQRWv3', category: 'community', bucket: 'promoted-remove', expectedHint: 'reject', note: 'EA University of Lagos — generic EA group, no AI-safety focus, no events.' },
  { url: 'https://www.joinhive.org/',                                category: 'community', bucket: 'promoted-remove', expectedHint: 'reject', note: 'Hive — entirely about farmed-animal advocacy, off-topic.' },
  { url: 'https://forum.effectivealtruism.org/groups/K2tAfbDjusPe3zXeG', category: 'community', bucket: 'promoted-remove', expectedHint: 'reject', note: 'EA Kaiserslautern — generic EA, last event Dec 2024, page stale.' },
  { url: 'https://aiscol.org',                                       category: 'community', bucket: 'promoted-remove', expectedHint: 'reject', note: 'AI Safety Colombia — domain dead (ECONNREFUSED).' },
  { url: 'https://www.eaeindhoven.nl/ai-safety-team',                category: 'community', bucket: 'promoted-remove', expectedHint: 'reject', note: 'EA Eindhoven AI Safety Team — page returns 404.' },

  // ─── Edge cases I want feedback on ─────────────────────
  { url: 'https://aisafety-cn.com',                                  category: 'community', bucket: 'edge',            expectedHint: 'accept', note: 'OCASC China — JS-rendered numbers; static HTML looks shell-y.' },
  { url: 'https://discord.gg/aJ9sk6g7rT',                            category: 'community', bucket: 'edge',            expectedHint: 'reject', note: 'Discord invite for "Shard Theory of Human Values" — invite may be expired.' },
  { url: 'https://www.facebook.com/groups/aisafetyuppsala/',         category: 'community', bucket: 'edge',            expectedHint: 'reject', note: 'Facebook group "AI Safety Uppsala" — auth-walled; we cannot see content.' },
  { url: 'https://t.me/+JYc1H2ABRpJhMjYy',                           category: 'community', bucket: 'edge',            expectedHint: 'reject', note: 'Telegram invite for MiriY — opaque, may be dead.' },
  { url: 'https://aisecurity.forum/dc-reading-group-26',             category: 'community', bucket: 'edge',            expectedHint: 'accept', note: 'DC Reading Group on AI Security — small but legitimate technical group.' },

  // ─── Currently in candidates / borderline ──────────────
  { url: 'https://www.eventbrite.com/e/beyond-policy-designing-ethical-ai-products-tickets-1988247929078', category: 'event', bucket: 'borderline', expectedHint: 'reject', note: 'Eventbrite "Designing Ethical AI Products" — corporate UX/governance webinar.' },
  { url: 'https://lu.ma/96nrl7hu',                                   category: 'event',     bucket: 'borderline',      expectedHint: 'reject', note: 'AI Game Changers Zurich — business/biz-growth event with governance veneer.' },
  { url: 'https://forum.effectivealtruism.org/events/eCLmpixwouFTPQKNo', category: 'event', bucket: 'borderline',      expectedHint: 'reject', note: 'EA Manchester "Psychology of Taking EA Seriously" — generic EA, not AI safety.' },
  { url: 'https://www.lesswrong.com/events/yn9fwKzLYS4TnaFsp',       category: 'event',     bucket: 'borderline',      expectedHint: 'reject', note: 'Rationalist Shabbat — social rationalist meetup, not AI safety.' },
  { url: 'https://luma.com/0lnfr8kh',                                category: 'event',     bucket: 'borderline',      expectedHint: 'accept', note: 'MATS Spring Research Talks London — real org, but Luma page lacks date.' },
];

const REPORT_DIR = path.resolve(process.cwd(), '.context/eval-reports');
const SCREENSHOT_DIR = path.resolve(process.cwd(), '.context/eval-reports/screenshots');

function safeName(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 80);
}

function emoji(verdict: 'accept' | 'reject'): string {
  return verdict === 'accept' ? '✅' : '❌';
}

async function main() {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

  console.log(`Running v2 pipeline against ${PICKS.length} picks...\n`);

  const outcomes: Array<{ pick: Pick; result: PipelineResult; matchesHint: boolean }> = [];
  for (let i = 0; i < PICKS.length; i++) {
    const pick = PICKS[i];
    const screenshotPath = path.join(SCREENSHOT_DIR, `pick-${safeName(pick.url)}.png`);
    try {
      const result = await evaluatePipeline(pick.url, pick.category, { saveScreenshotTo: screenshotPath });
      const matchesHint = pick.expectedHint ? result.finalVerdict === pick.expectedHint : true;
      const flag = matchesHint ? '✓' : '⚠';
      console.log(`[${i + 1}/${PICKS.length}] ${flag} ${result.finalVerdict.padEnd(6)} ${pick.url}  (${result.decidedAt}, ${result.durationSec.toFixed(1)}s)`);
      outcomes.push({ pick, result, matchesHint });
    } catch (err: any) {
      console.error(`[${i + 1}/${PICKS.length}] 💥 pipeline failed for ${pick.url}: ${err.message}`);
    }
  }

  await closeBrowser();

  // ─── Render checklist ──────────────────────────────────
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORT_DIR, `verify-pick-${ts}.md`);

  const lines: string[] = [];
  lines.push(`# Verification checklist — ${PICKS.length} picks`);
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()}.`);
  lines.push('');
  lines.push('For each row, review the URL and the verdict the v2 pipeline produced. If the verdict matches what you would say after a quick look at the page, mark it ✓. If wrong, write what the right call would have been.');
  lines.push('');

  // Group by bucket
  const buckets = Array.from(new Set(outcomes.map(o => o.pick.bucket)));
  for (const bucket of buckets) {
    const items = outcomes.filter(o => o.pick.bucket === bucket);
    lines.push(`## ${bucket}  (${items.length})`);
    lines.push('');
    for (const { pick, result, matchesHint } of items) {
      const hint = pick.expectedHint ? ` (my guess: ${pick.expectedHint})` : '';
      const matchFlag = pick.expectedHint && !matchesHint ? '  ⚠️ disagrees with my guess' : '';
      lines.push(`### ${emoji(result.finalVerdict)} \`${result.finalVerdict}\` — ${pick.url}${matchFlag}`);
      lines.push('');
      lines.push(`*${pick.note}*${hint}`);
      lines.push('');
      lines.push(`- decided at: \`${result.decidedAt}\``);
      lines.push(`- stage1: \`${result.stage1.verdict}\` (conf ${result.stage1.confidence.toFixed(2)})`);
      if (result.stage1.reasoning) {
        lines.push(`- stage1 reasoning: ${result.stage1.reasoning}`);
      }
      if (result.stage2) {
        lines.push(`- stage2: \`${result.stage2.verdict}\` (conf ${result.stage2.confidence.toFixed(2)})`);
        if (result.stage2.reasoning) {
          lines.push(`- stage2 reasoning: ${result.stage2.reasoning}`);
        }
        if (result.stage2.screenshotPath) {
          lines.push(`- screenshot: ${result.stage2.screenshotPath}`);
        }
      }
      lines.push('');
      lines.push(`- [ ] **right call** — leave blank if the verdict is correct`);
      lines.push(`- [ ] **wrong call** — should have been: ___________`);
      lines.push('');
    }
  }

  // Summary table
  lines.push('## Summary table');
  lines.push('');
  lines.push('| # | bucket | url | verdict | matches my guess |');
  lines.push('|---|---|---|---|---|');
  outcomes.forEach((o, i) => {
    lines.push(`| ${i + 1} | ${o.pick.bucket} | ${o.pick.url} | ${o.result.finalVerdict} | ${o.matchesHint ? '✓' : '⚠️'} |`);
  });
  lines.push('');

  await fs.writeFile(reportPath, lines.join('\n'));
  console.log(`\n📝 Checklist written to: ${reportPath}`);

  const wrongHints = outcomes.filter(o => o.pick.expectedHint && !o.matchesHint);
  if (wrongHints.length > 0) {
    console.log(`⚠️  ${wrongHints.length} verdicts disagree with my guess (interesting cases — review these first).`);
  }
}

main().catch(async err => {
  console.error('Fatal:', err);
  await closeBrowser().catch(() => undefined);
  process.exit(1);
});
