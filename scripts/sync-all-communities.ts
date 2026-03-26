/**
 * sync-all-communities.ts - The full community pipeline orchestrator.
 *
 * Runs the gatherer, then processes the queue through the AI evaluator.
 * This is the single command for autonomous community pipeline operation.
 *
 * Usage:
 *   npx tsx scripts/sync-all-communities.ts
 *   npx tsx scripts/sync-all-communities.ts --skip-gather    # Only evaluate pending queue
 *   npx tsx scripts/sync-all-communities.ts --skip-evaluate   # Only gather, don't evaluate
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { run as runSyncCommunities } from './sync-communities';
import { run as runEvaluateCommunity } from './evaluate-community';

export async function run(opts: { skipGather?: boolean; skipEvaluate?: boolean } = {}) {
  const { skipGather = false, skipEvaluate = false } = opts;
  const startTime = Date.now();
  console.log('='.repeat(60));
  console.log('  COMMUNITY PIPELINE - howdoihelp.ai');
  console.log(`  ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // Phase 1: Gather
  if (!skipGather) {
    console.log('\n\n--- PHASE 1: GATHERING ---\n');
    console.log('Running community sync (EA Forum, LessWrong, PauseAI, AISafety.com)...\n');

    try {
      await runSyncCommunities();
    } catch (err: any) {
      console.error(`\n  WARNING: Community sync had errors: ${err.message}. Continuing...\n`);
    }
  } else {
    console.log('\n  Skipping gather phase (--skip-gather)\n');
  }

  // Phase 2: Evaluate
  if (!skipEvaluate) {
    console.log('\n\n--- PHASE 2: AI EVALUATION ---\n');
    console.log('Processing all pending community candidates through Claude...\n');

    try {
      await runEvaluateCommunity({ processQueue: true });
    } catch (err: any) {
      console.error(`\n  WARNING: Evaluation phase had errors: ${err.message}\n`);
    }
  } else {
    console.log('\n  Skipping evaluate phase (--skip-evaluate)\n');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log(`  COMMUNITY PIPELINE COMPLETE - ${elapsed}s`);
  console.log('='.repeat(60));
}

// CLI entrypoint
if (process.argv[1]?.includes('/scripts/')) {
  const args = process.argv.slice(2);
  run({
    skipGather: args.includes('--skip-gather'),
    skipEvaluate: args.includes('--skip-evaluate'),
  }).catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
