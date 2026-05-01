/**
 * run-all.ts - The single command launchd invokes on schedule.
 *
 * Phases (in order):
 *   1. Gather + old-eval — runs the existing event/community/program
 *      pipelines that fetch new candidates from EA Forum, LessWrong, Luma,
 *      Eventbrite, Meetup, etc., and pass them through the v1 evaluator.
 *      This preserves the current "new content lands in the directory"
 *      behaviour that the GitHub Actions workflow used to provide.
 *   2. v2 reverify — re-checks every enabled community and upcoming event
 *      with the v2 (text + vision) pipeline and emits a Markdown report
 *      flagging rows that should be disabled.
 *
 * Each phase swallows its own errors (continue-on-error semantics) so that
 * a flaky gatherer doesn't block the rest. The reverify report is the
 * primary artifact the user reviews.
 *
 * Usage:
 *   npx tsx scripts/eval-cron/run-all.ts                # full run
 *   npx tsx scripts/eval-cron/run-all.ts --skip-gather  # only reverify
 *   npx tsx scripts/eval-cron/run-all.ts --skip-reverify # only gather + old-eval
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { spawn } from 'node:child_process';
import * as path from 'node:path';

const PROJECT_DIR = path.resolve(__dirname, '..', '..');

interface Phase {
  name: string;
  cmd: string[];
  /** When true, the phase inherits CLAUDE_PROVIDER=cli for subscription. */
  useCli: boolean;
}

const PHASES: Phase[] = [
  // Gather + v1 evaluator. Uses ANTHROPIC_API_KEY (cheap haiku calls) — these
  // scripts predate the subscription path. Cost is small (~$1-3 per run).
  { name: 'events:   sync-all-events',      cmd: ['npx', 'tsx', 'scripts/sync-all-events.ts'],      useCli: false },
  { name: 'comms:    sync-all-communities', cmd: ['npx', 'tsx', 'scripts/sync-all-communities.ts'], useCli: false },
  { name: 'programs: sync-programs',         cmd: ['npx', 'tsx', 'scripts/sync-programs.ts'],        useCli: false },
  { name: 'cleanup:  standardize-countries', cmd: ['npx', 'tsx', 'scripts/standardize-countries.ts'], useCli: false },
  // v2 reverify on already-promoted resources. Uses CLAUDE_PROVIDER=cli so it
  // runs on the user's Claude Code subscription instead of the paid API.
  { name: 'v2:       reverify',              cmd: ['npx', 'tsx', 'scripts/eval-cron/reverify.ts'],   useCli: true  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    skipGather: args.includes('--skip-gather'),
    skipReverify: args.includes('--skip-reverify'),
  };
}

async function runPhase(phase: Phase): Promise<{ ok: boolean; durationSec: number }> {
  const t0 = Date.now();
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (phase.useCli) env.CLAUDE_PROVIDER = 'cli';

  return new Promise(resolve => {
    const proc = spawn(phase.cmd[0], phase.cmd.slice(1), {
      cwd: PROJECT_DIR,
      env,
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
  const { skipGather, skipReverify } = parseArgs();

  console.log('═'.repeat(60));
  console.log(`  HOWDOIHELP.AI scheduled run — ${new Date().toISOString()}`);
  console.log(`  cwd:        ${PROJECT_DIR}`);
  console.log(`  gather:     ${skipGather ? 'SKIP' : 'on'}`);
  console.log(`  reverify:   ${skipReverify ? 'SKIP' : 'on'}`);
  console.log('═'.repeat(60));

  const summary: Array<{ name: string; ok: boolean; durationSec: number }> = [];

  for (const phase of PHASES) {
    const isReverify = phase.name.startsWith('v2:');
    if (skipGather && !isReverify) continue;
    if (skipReverify && isReverify) continue;

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
  process.exit(failed > 0 ? 1 : 0);
}

main();
