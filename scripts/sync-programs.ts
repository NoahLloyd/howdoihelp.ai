/**
 * sync-programs.ts - The full programs pipeline orchestrator.
 *
 * Runs the BlueDot gatherer to scrape courses and upcoming rounds.
 * (Evaluation phase can be added later when an evaluator is built.)
 *
 * Usage:
 *   npx tsx scripts/sync-programs.ts
 *   npx tsx scripts/sync-programs.ts --dry-run    # Gather without inserting
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { spawn } from 'child_process';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function runScript(scriptPath: string, extraArgs: string[] = []): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn('npx', ['tsx', scriptPath, ...extraArgs], {
      cwd: process.cwd(),
      shell: true,
      env: process.env,
    });

    child.stdout?.on('data', (data) => {
      const str = data.toString();
      output += str;
      process.stdout.write(str);
    });

    child.stderr?.on('data', (data) => {
      const str = data.toString();
      output += str;
      process.stderr.write(str);
    });

    child.on('close', (code) => {
      resolve({ success: code === 0, output });
    });

    child.on('error', (err) => {
      resolve({ success: false, output: err.message });
    });
  });
}

async function main() {
  const startTime = Date.now();
  console.log('='.repeat(60));
  console.log('  PROGRAMS PIPELINE - howdoihelp.ai');
  console.log(`  ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // Phase 1: Gather from all sources
  console.log('\n\n--- PHASE 1: GATHERING ---\n');

  const gatherArgs = dryRun ? ['--dry-run'] : [];

  console.log('Running BlueDot Impact gatherer...\n');
  const bluedotResult = await runScript('scripts/gatherers/gather-bluedot.ts', gatherArgs);
  if (!bluedotResult.success) {
    console.error('\n  WARNING: BlueDot gatherer had errors.\n');
  }

  console.log('\nRunning AISafety.com gatherer (programs)...\n');
  const aisafetyResult = await runScript('scripts/gatherers/gather-aisafety.ts', ['--programs', ...gatherArgs]);
  if (!aisafetyResult.success) {
    console.error('\n  WARNING: AISafety.com programs gatherer had errors.\n');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log(`  PROGRAMS PIPELINE COMPLETE - ${elapsed}s`);
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
