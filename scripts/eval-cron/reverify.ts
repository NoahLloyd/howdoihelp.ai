/**
 * reverify.ts - Scheduled re-verification job for the v2 evaluator.
 *
 * Runs through every currently-promoted resource (events + communities) and
 * asks the v2 pipeline whether the URL still passes. Writes a Markdown
 * report to .context/eval-reports/<timestamp>.md listing rows that the
 * v2 pipeline now rejects.
 *
 * This is read-only on the database — it does NOT auto-disable rows. The
 * report is meant to be reviewed by Noah before any disabling happens.
 *
 * Designed to be invoked by launchd. A "last run" timestamp guard prevents
 * re-running if the previous run finished within MIN_RUN_INTERVAL_HOURS.
 *
 * Usage:
 *   npx tsx scripts/eval-cron/reverify.ts            # normal scheduled run
 *   npx tsx scripts/eval-cron/reverify.ts --force    # ignore the time guard
 *   npx tsx scripts/eval-cron/reverify.ts --limit 20 # cap rows checked
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { evaluatePipeline, type PipelineResult } from '../lib/evaluate-pipeline';
import { closeBrowser } from '../lib/evaluate-stage2';

// Reverify is the slow part (~5-7h on the subscription CLI for ~900 rows),
// so we run it WEEKLY, not every-other-day. The launchd plist fires daily
// at 11:00 and run-all.ts always runs the gather phase, but reverify only
// kicks in when this floor (~7 days) has passed since the last real run.
const MIN_RUN_INTERVAL_HOURS = 167;
const LAST_RUN_FILE = path.join(os.homedir(), '.howdoihelpai-eval-last-run');
const REPORT_DIR = path.resolve(process.cwd(), '.context/eval-reports');
const SCREENSHOT_DIR = path.resolve(process.cwd(), '.context/eval-reports/screenshots');

interface Row {
  id: string;
  title: string;
  url: string;
  category: 'events' | 'communities' | string;
  source_org: string | null;
  enabled: boolean;
  status: string | null;
}

interface Outcome {
  row: Row;
  result: PipelineResult;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  let limit: number | undefined;
  const li = args.indexOf('--limit');
  if (li >= 0) limit = parseInt(args[li + 1] || '0', 10) || undefined;
  return { force, limit };
}

async function checkLastRun(force: boolean): Promise<void> {
  if (force) return;
  try {
    const stat = await fs.stat(LAST_RUN_FILE);
    const hoursAgo = (Date.now() - stat.mtimeMs) / 3_600_000;
    if (hoursAgo < MIN_RUN_INTERVAL_HOURS) {
      console.log(
        `Skipping: last run was ${hoursAgo.toFixed(1)}h ago (< ${MIN_RUN_INTERVAL_HOURS}h). Use --force to override.`,
      );
      process.exit(0);
    }
  } catch {
    // file doesn't exist; OK to proceed
  }
}

async function markRan(): Promise<void> {
  await fs.writeFile(LAST_RUN_FILE, new Date().toISOString());
}

function safeName(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 80);
}

function pipelineCategoryOf(row: Row): 'event' | 'community' {
  return row.category === 'events' ? 'event' : 'community';
}

async function main() {
  const { force, limit } = parseArgs();
  await checkLastRun(force);

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  console.log('📥 Fetching enabled resources from Supabase...');
  // Communities: every enabled row.
  // Events: only upcoming (event_date >= today). Past events shouldn't be in
  // the directory anyway and would burn pipeline cost for no reason.
  const today = new Date().toISOString().slice(0, 10);

  const { data: communities, error: cErr } = await supa
    .from('resources')
    .select('id, title, url, category, source_org, enabled, status')
    .eq('enabled', true)
    .eq('category', 'communities');
  if (cErr) throw new Error(`Communities query failed: ${cErr.message}`);

  const { data: events, error: eErr } = await supa
    .from('resources')
    .select('id, title, url, category, source_org, enabled, status, event_date')
    .eq('enabled', true)
    .eq('category', 'events')
    .gte('event_date', today);
  if (eErr) throw new Error(`Events query failed: ${eErr.message}`);

  let rows: Row[] = [...(communities || []), ...(events || [])] as Row[];
  if (limit) rows = rows.slice(0, limit);

  if (rows.length === 0) {
    console.log('No enabled communities/upcoming events to re-verify. Nothing to do.');
    await markRan();
    return;
  }

  console.log(`Re-verifying ${rows.length} rows  (${communities?.length || 0} communities + ${events?.length || 0} upcoming events).`);

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

  const outcomes: Outcome[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Row;
    const screenshotPath = path.join(SCREENSHOT_DIR, `${safeName(row.url)}.png`);
    try {
      const result = await evaluatePipeline(row.url, pipelineCategoryOf(row), {
        saveScreenshotTo: screenshotPath,
      });
      outcomes.push({ row, result });
      const flag = result.finalVerdict === 'accept' ? '✅' : '⚠️';
      console.log(
        `[${i + 1}/${rows.length}] ${flag} ${result.finalVerdict.padEnd(6)} ${row.url}  (${result.decidedAt}, ${result.durationSec.toFixed(1)}s)`,
      );
    } catch (err: any) {
      console.error(`[${i + 1}/${rows.length}] 💥 pipeline failed for ${row.url}: ${err.message}`);
    }
  }

  await closeBrowser();

  // ─── Report ───────────────────────────────────────────────

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORT_DIR, `reverify-${ts}.md`);

  const accepted = outcomes.filter(o => o.result.finalVerdict === 'accept');
  // Split rejects into two buckets: auth-walled (rejected because we can't see
  // content; safe to manually keep) vs. content-rejected (likely actually bad).
  const authWalled = outcomes.filter(o => o.result.stage1.shortCircuit === 'auth-walled');
  const contentRejected = outcomes.filter(
    o => o.result.finalVerdict === 'reject' && o.result.stage1.shortCircuit !== 'auth-walled',
  );

  const lines: string[] = [];
  lines.push(`# Re-verification report — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Checked **${outcomes.length}** enabled resources. v2 pipeline now:`);
  lines.push(`- ✅ accepts: **${accepted.length}**`);
  lines.push(`- ⚠️ rejects (likely bad): **${contentRejected.length}**`);
  lines.push(`- 🔒 rejects (auth-walled, manual review): **${authWalled.length}**`);
  lines.push('');

  if (authWalled.length > 0) {
    lines.push('## 🔒 Auth-walled rows (manual review)');
    lines.push('');
    lines.push('These rows live behind authentication (Discord, Telegram, Facebook, etc.) so the v2 pipeline cannot see real content and rejects by default. **Leave them enabled if you trust them; disable if not.** Either decision is fine — the pipeline cannot make this call for you.');
    lines.push('');
    for (const { row, result } of authWalled) {
      lines.push(`### 🔒 ${row.title}`);
      lines.push('');
      lines.push(`- **id**: \`${row.id}\``);
      lines.push(`- **url**: ${row.url}`);
      lines.push(`- **category**: ${row.category}`);
      lines.push(`- **host**: ${result.scrape.finalHost}`);
      lines.push('');
      lines.push(`To disable: \`update resources set enabled=false where id='${row.id}';\``);
      lines.push('');
    }
  }

  if (contentRejected.length > 0) {
    lines.push('## ⚠️ Rows the v2 pipeline now REJECTS (likely actually bad)');
    lines.push('');
    lines.push('These were previously promoted but the new pipeline says they should not be in the directory based on actual content (off-topic, dead, stale, off-purpose). Review and consider disabling.');
    lines.push('');
    for (const { row, result } of contentRejected) {
      lines.push(`### ${row.title}`);
      lines.push('');
      lines.push(`- **id**: \`${row.id}\``);
      lines.push(`- **url**: ${row.url}`);
      lines.push(`- **category**: ${row.category}`);
      lines.push(`- **decided at**: ${result.decidedAt}`);
      lines.push(`- **stage1 verdict**: ${result.stage1.verdict} (conf ${result.stage1.confidence.toFixed(2)})`);
      if (result.stage1.red_flags.length) {
        lines.push(`- **stage1 red flags**: ${result.stage1.red_flags.join('; ')}`);
      }
      lines.push(`- **stage1 reasoning**: ${result.stage1.reasoning}`);
      if (result.stage2) {
        lines.push(`- **stage2 verdict**: ${result.stage2.verdict} (conf ${result.stage2.confidence.toFixed(2)})`);
        if (result.stage2.red_flags.length) {
          lines.push(`- **stage2 red flags**: ${result.stage2.red_flags.join('; ')}`);
        }
        lines.push(`- **stage2 reasoning**: ${result.stage2.reasoning}`);
        if (result.stage2.screenshotPath) {
          lines.push(`- **screenshot**: ${result.stage2.screenshotPath}`);
        }
      }
      lines.push('');
      lines.push(`To disable: \`update resources set enabled=false where id='${row.id}';\``);
      lines.push('');
    }
  } else if (authWalled.length === 0) {
    lines.push('## ✅ No regressions');
    lines.push('');
    lines.push('Every currently-enabled resource still passes the v2 pipeline.');
    lines.push('');
  }

  lines.push('## All outcomes (one line each)');
  lines.push('');
  lines.push('| verdict | category | url | decided at | stage1 conf | duration |');
  lines.push('|---|---|---|---|---|---|');
  for (const { row, result } of outcomes) {
    lines.push(
      `| ${result.finalVerdict} | ${row.category} | ${row.url} | ${result.decidedAt} | ${result.stage1.confidence.toFixed(2)} | ${result.durationSec.toFixed(1)}s |`,
    );
  }
  lines.push('');

  await fs.writeFile(reportPath, lines.join('\n'));
  console.log(`\n📝 Report written to ${reportPath}`);
  console.log(`   ✅ accepted:        ${accepted.length}`);
  console.log(`   ⚠️  rejected (bad): ${contentRejected.length}`);
  console.log(`   🔒 auth-walled:     ${authWalled.length}`);

  await markRan();
}

main().catch(async err => {
  console.error('Fatal:', err);
  await closeBrowser().catch(() => undefined);
  process.exit(1);
});
