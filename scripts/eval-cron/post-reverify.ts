/**
 * post-reverify.ts - Driver that runs after the v2 reverify produces a
 * fresh report. Skips itself if there's no fresh report to process.
 *
 * Steps (only when there is a fresh reverify report to process):
 *   1. snapshot current DB state
 *   2. check-ea-lw-activity.ts        (free; EA/LW GraphQL)
 *   3. categorize-other-rejects.ts    (free; text-mining)
 *   4. check-authwalled-liveness.ts   (Claude subscription; ~10 min)
 *   5. apply-disposition.ts --apply   (with safety threshold)
 *
 * The cron triggers this every fire, but it's a no-op unless a new
 * reverify-*.md report exists since last successful apply.
 *
 * Usage:
 *   npx tsx scripts/eval-cron/post-reverify.ts
 *   npx tsx scripts/eval-cron/post-reverify.ts --force      # ignore freshness gate
 *   npx tsx scripts/eval-cron/post-reverify.ts --max-disables 200
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createClient } from '@supabase/supabase-js';

const PROJECT_DIR = path.resolve(__dirname, '..', '..');
const REPORT_DIR = path.resolve(PROJECT_DIR, '.context/eval-reports');
const SENTINEL = path.join(os.homedir(), '.howdoihelpai-post-reverify-last-run');

function parseArgs() {
  const a = process.argv.slice(2);
  const mdi = a.indexOf('--max-disables');
  return {
    force: a.includes('--force'),
    maxDisables: mdi >= 0 ? a[mdi + 1] || '100' : '100',
  };
}

async function newest(prefix: string, ext: string): Promise<{ path: string; mtimeMs: number } | null> {
  try {
    const entries = await fs.readdir(REPORT_DIR);
    const matched = entries.filter(n => n.startsWith(prefix) && n.endsWith(ext));
    if (matched.length === 0) return null;
    matched.sort();
    const last = matched[matched.length - 1];
    const full = path.join(REPORT_DIR, last);
    const stat = await fs.stat(full);
    return { path: full, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

async function isFresh(): Promise<boolean> {
  // Run when the newest reverify-*.md is younger than our last sentinel.
  const reverify = await newest('reverify-', '.md');
  if (!reverify) {
    console.log('post-reverify: no reverify-*.md found yet — nothing to process.');
    return false;
  }
  let sentinelMtime = 0;
  try {
    sentinelMtime = (await fs.stat(SENTINEL)).mtimeMs;
  } catch {
    /* sentinel missing — first run */
  }
  if (reverify.mtimeMs <= sentinelMtime) {
    console.log(
      `post-reverify: latest reverify (${path.basename(reverify.path)}) is older than last successful run — nothing to process.`,
    );
    return false;
  }
  console.log(`post-reverify: fresh reverify report found (${path.basename(reverify.path)}). Proceeding.`);
  return true;
}

async function markRan(): Promise<void> {
  await fs.writeFile(SENTINEL, new Date().toISOString());
}

async function snapshot(): Promise<string> {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const all: unknown[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supa
      .from('resources')
      .select('id,title,url,enabled,activity_score,verification_notes,verified_at,url_status')
      .range(from, from + 999);
    if (error) throw new Error(`snapshot failed: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const out = path.join(REPORT_DIR, `snapshot-pre-apply-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(out, JSON.stringify(all, null, 2));
  return out;
}

interface PhaseResult {
  name: string;
  ok: boolean;
  durationSec: number;
  exitCode: number | null;
}

async function runPhase(name: string, cmd: string[], extraEnv?: Record<string, string>): Promise<PhaseResult> {
  const t0 = Date.now();
  console.log(`\n▶ ${name}`);
  return new Promise(resolve => {
    const proc = spawn(cmd[0], cmd.slice(1), {
      cwd: PROJECT_DIR,
      env: { ...process.env, ...extraEnv },
      stdio: 'inherit',
    });
    proc.on('close', code => {
      resolve({
        name,
        ok: code === 0,
        durationSec: (Date.now() - t0) / 1000,
        exitCode: code,
      });
    });
    proc.on('error', () => {
      resolve({ name, ok: false, durationSec: (Date.now() - t0) / 1000, exitCode: -1 });
    });
  });
}

async function main() {
  const { force, maxDisables } = parseArgs();

  if (!force && !(await isFresh())) {
    process.exit(0);
  }

  console.log(`\n${'═'.repeat(60)}\n  POST-REVERIFY  (max-disables=${maxDisables})\n${'═'.repeat(60)}`);

  // Step 1: Snapshot
  console.log('\n▶ snapshot pre-apply');
  const snapPath = await snapshot();
  console.log(`  Saved snapshot to ${snapPath}`);

  const summary: PhaseResult[] = [];

  // Step 2-4: Classification scripts
  summary.push(
    await runPhase('check-ea-lw-activity', ['npx', 'tsx', 'scripts/eval-cron/check-ea-lw-activity.ts']),
  );
  summary.push(
    await runPhase('categorize-other-rejects', ['npx', 'tsx', 'scripts/eval-cron/categorize-other-rejects.ts']),
  );
  summary.push(
    await runPhase(
      'check-authwalled-liveness',
      ['npx', 'tsx', 'scripts/eval-cron/check-authwalled-liveness.ts'],
      { CLAUDE_PROVIDER: 'cli' },
    ),
  );

  const earlyFails = summary.filter(s => !s.ok);
  if (earlyFails.length > 0) {
    console.error(
      `\n⚠️  ${earlyFails.length} classifier phase(s) failed before apply. Skipping apply for safety.`,
    );
    for (const f of earlyFails) console.error(`  ✗ ${f.name} (exit ${f.exitCode})`);
    process.exit(1);
  }

  // Step 5: Apply
  summary.push(
    await runPhase(
      'apply-disposition --apply',
      ['npx', 'tsx', 'scripts/eval-cron/apply-disposition.ts', '--apply', '--max-disables', String(maxDisables)],
    ),
  );

  console.log('\n' + '═'.repeat(60));
  console.log('  POST-REVERIFY SUMMARY');
  console.log('═'.repeat(60));
  for (const s of summary) {
    console.log(`  ${s.ok ? '✅' : '⚠️'}  ${s.name.padEnd(34)} ${s.durationSec.toFixed(0)}s${s.ok ? '' : ` (exit ${s.exitCode})`}`);
  }
  const failed = summary.filter(s => !s.ok).length;
  if (failed === 0) {
    await markRan();
    console.log('\nAll post-reverify phases ok.');
    process.exit(0);
  } else {
    console.log(`\n${failed} phase(s) failed.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
