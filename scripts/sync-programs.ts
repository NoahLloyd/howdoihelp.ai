/**
 * sync-programs.ts - The full programs pipeline orchestrator.
 *
 * Runs the BlueDot and AISafety gatherers to scrape courses and upcoming rounds.
 *
 * Usage:
 *   npx tsx scripts/sync-programs.ts
 *   npx tsx scripts/sync-programs.ts --dry-run    # Gather without inserting
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { run as runBluedot } from './gatherers/gather-bluedot';
import { run as runAisafety } from './gatherers/gather-aisafety';

export async function run(opts: { dryRun?: boolean } = {}) {
  const { dryRun = false } = opts;
  const startTime = Date.now();
  console.log('='.repeat(60));
  console.log('  PROGRAMS PIPELINE - howdoihelp.ai');
  console.log(`  ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // Phase 1: Gather from all sources
  console.log('\n\n--- PHASE 1: GATHERING ---\n');

  console.log('Running BlueDot Impact gatherer...\n');
  try {
    await runBluedot({ dryRun });
  } catch (err: any) {
    console.error(`\n  WARNING: BlueDot gatherer had errors: ${err.message}\n`);
  }

  console.log('\nRunning AISafety.com gatherer (programs)...\n');
  try {
    await runAisafety({ dryRun, programs: true });
  } catch (err: any) {
    console.error(`\n  WARNING: AISafety.com programs gatherer had errors: ${err.message}\n`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log(`  PROGRAMS PIPELINE COMPLETE - ${elapsed}s`);
  console.log('='.repeat(60));
}

// CLI entrypoint
if (process.argv[1]?.endsWith('/scripts/sync-programs.ts')) {
  run({ dryRun: process.argv.includes('--dry-run') }).catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
