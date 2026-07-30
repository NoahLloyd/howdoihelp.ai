/**
 * run-all.ts - The single command launchd invokes on schedule.
 *
 * Phases (in order):
 *   1. AISafety API mirror — refreshes AISafety.com communities, events, and
 *      training from the official public API into resources.
 *   2. Lightweight cleanup — normalizes display fields that are cheap and
 *      deterministic.
 *
 * External candidate gatherers and AI evaluators remain available for manual
 * discovery/submissions, but are not part of the scheduled run.
 *
 * Usage:
 *   npx tsx scripts/eval-cron/run-all.ts                # full run
 *   npx tsx scripts/eval-cron/run-all.ts --skip-sync    # only cleanup
 *   npx tsx scripts/eval-cron/run-all.ts --skip-cleanup # only AISafety sync
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const PROJECT_DIR = path.resolve(__dirname, '..', '..');

// launchd fires daily at 11:00. We use internal floors so the heavy work
// runs on the cadence we actually want.
const MIN_RUN_INTERVAL_HOURS = 47;
const LAST_RUN_FILE = path.join(os.homedir(), '.howdoihelpai-run-all-last-run');

interface Phase {
  name: string;
  cmd: string[];
  kind: 'sync' | 'cleanup';
}

const PHASES: Phase[] = [
  { name: 'aisafety: sync-aisafety',         cmd: ['npx', 'tsx', 'scripts/sync-aisafety.ts'], kind: 'sync' },
  { name: 'cleanup:  standardize-countries', cmd: ['npx', 'tsx', 'scripts/standardize-countries.ts'], kind: 'cleanup' },
];

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    skipSync: args.includes('--skip-sync') || args.includes('--skip-gather'),
    skipCleanup: args.includes('--skip-cleanup') || args.includes('--skip-reverify'),
    force: args.includes('--force'),
  };
}

async function checkLastRun(force: boolean): Promise<void> {
  if (force) return;
  try {
    const stat = await fs.stat(LAST_RUN_FILE);
    const hoursAgo = (Date.now() - stat.mtimeMs) / 3_600_000;
    if (hoursAgo < MIN_RUN_INTERVAL_HOURS) {
      console.log(
        `Skipping run-all: last full run was ${hoursAgo.toFixed(1)}h ago (< ${MIN_RUN_INTERVAL_HOURS}h floor). Use --force to override.`,
      );
      process.exit(0);
    }
  } catch {
    // file missing — first run, OK
  }
}

async function markRan(): Promise<void> {
  await fs.writeFile(LAST_RUN_FILE, new Date().toISOString());
}

async function runPhase(phase: Phase): Promise<{ ok: boolean; durationSec: number }> {
  const t0 = Date.now();

  return new Promise(resolve => {
    const proc = spawn(phase.cmd[0], phase.cmd.slice(1), {
      cwd: PROJECT_DIR,
      env: { ...process.env },
      stdio: 'inherit',
    });
    proc.on('close', code => {
      resolve({ ok: code === 0, durationSec: (Date.now() - t0) / 1000 });
    });
    proc.on('error', () => {
      resolve({ ok: false, durationSec: (Date.now() - t0) / 1000 });
    });
  });
}

async function main() {
  const { skipSync, skipCleanup, force } = parseArgs();
  await checkLastRun(force);

  console.log('═'.repeat(60));
  console.log(`  HOWDOIHELP.AI scheduled run — ${new Date().toISOString()}`);
  console.log(`  cwd:        ${PROJECT_DIR}`);
  console.log(`  aisafety:   ${skipSync ? 'SKIP' : 'on'}`);
  console.log(`  cleanup:    ${skipCleanup ? 'SKIP' : 'on'}`);
  console.log('═'.repeat(60));

  const summary: Array<{ name: string; ok: boolean; durationSec: number }> = [];

  for (const phase of PHASES) {
    if (skipSync && phase.kind === 'sync') continue;
    if (skipCleanup && phase.kind === 'cleanup') continue;

    console.log(`\n▶ ${phase.name}`);
    const result = await runPhase(phase);
    const flag = result.ok ? '✅' : '⚠️';
    console.log(`${flag} ${phase.name}  (${result.durationSec.toFixed(0)}s)`);
    summary.push({ name: phase.name, ...result });
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));
  for (const s of summary) {
    console.log(`  ${s.ok ? '✅' : '⚠️'}  ${s.name.padEnd(34)}  ${s.durationSec.toFixed(0)}s`);
  }
  const failed = summary.filter(s => !s.ok).length;
  console.log(`\n  ${failed === 0 ? 'All phases ok.' : `${failed} phase(s) failed.`}`);
  if (failed === 0) await markRan();
  process.exit(failed > 0 ? 1 : 0);
}

main();
