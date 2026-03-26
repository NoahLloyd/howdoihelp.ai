/**
 * sync-all-events.ts - The full event pipeline orchestrator.
 *
 * Runs all gatherers, then processes the queue through the AI evaluator.
 * This is the single command for autonomous event pipeline operation.
 *
 * Usage:
 *   npx tsx scripts/sync-all-events.ts
 *   npx tsx scripts/sync-all-events.ts --skip-gather    # Only evaluate pending queue
 *   npx tsx scripts/sync-all-events.ts --skip-evaluate   # Only gather, don't evaluate
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { run as runAisafety } from './gatherers/gather-aisafety';
import { run as runEaLesswrong } from './gatherers/gather-ea-lesswrong';
import { run as runEventbrite } from './gatherers/gather-eventbrite';
import { run as runLuma } from './gatherers/gather-luma';
import { run as runMeetup } from './gatherers/gather-meetup';
import { run as runEvaluate } from './evaluate-event';

const GATHERERS = [
  { name: 'AISafety.com Airtable', run: runAisafety },
  { name: 'EA Forum + LessWrong', run: runEaLesswrong },
  { name: 'Eventbrite', run: runEventbrite },
  { name: 'Luma', run: runLuma },
  { name: 'Meetup.com', run: runMeetup },
];

export async function run(opts: { skipGather?: boolean; skipEvaluate?: boolean } = {}) {
  const { skipGather = false, skipEvaluate = false } = opts;
  const startTime = Date.now();
  console.log('='.repeat(60));
  console.log('  EVENT PIPELINE - howdoihelp.ai');
  console.log(`  ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // Phase 1: Gather
  if (!skipGather) {
    console.log('\n\n--- PHASE 1: GATHERING ---\n');

    for (const gatherer of GATHERERS) {
      console.log(`\n[${'='.repeat(40)}]`);
      console.log(`  Running: ${gatherer.name}`);
      console.log(`[${'='.repeat(40)}]\n`);

      try {
        await gatherer.run();
      } catch (err: any) {
        console.error(`\n  WARNING: ${gatherer.name} gatherer failed: ${err.message}. Continuing...\n`);
      }
    }
  } else {
    console.log('\n  Skipping gather phase (--skip-gather)\n');
  }

  // Phase 2: Evaluate
  if (!skipEvaluate) {
    console.log('\n\n--- PHASE 2: AI EVALUATION ---\n');
    console.log('Processing all pending candidates through Claude...\n');

    try {
      await runEvaluate({ processQueue: true });
    } catch (err: any) {
      console.error(`\n  WARNING: Evaluation phase had errors: ${err.message}\n`);
    }
  } else {
    console.log('\n  Skipping evaluate phase (--skip-evaluate)\n');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log(`  PIPELINE COMPLETE - ${elapsed}s`);
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
