/**
 * sync-programs.ts - The full programs pipeline orchestrator.
 *
 * Compatibility entrypoint for program data. The scheduled/default path now
 * mirrors AISafety.com's official training API directly into resources.
 * BlueDot remains available via scripts/gatherers/gather-bluedot.ts for manual
 * candidate discovery, but is not part of this orchestrator.
 *
 * Usage:
 *   npx tsx scripts/sync-programs.ts
 *   npx tsx scripts/sync-programs.ts --dry-run    # Gather without inserting
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { run as runAisafetySync } from './sync-aisafety';

export async function run(opts: { dryRun?: boolean } = {}) {
  const { dryRun = false } = opts;
  const startTime = Date.now();
  console.log('='.repeat(60));
  console.log('  PROGRAMS PIPELINE - howdoihelp.ai');
  console.log(`  ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  console.log('\n\n--- PHASE 1: AISAFETY TRAINING API MIRROR ---\n');

  await runAisafetySync({ dryRun, collections: ['training'] });

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
