/**
 * sync-all-communities.ts — The full community pipeline orchestrator.
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

import { spawn } from 'child_process';

const args = process.argv.slice(2);
const skipGather = args.includes('--skip-gather');
const skipEvaluate = args.includes('--skip-evaluate');

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
  console.log('  COMMUNITY PIPELINE — howdoihelp.ai');
  console.log(`  ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // Phase 1: Gather
  if (!skipGather) {
    console.log('\n\n--- PHASE 1: GATHERING ---\n');
    console.log('Running community sync (EA Forum, LessWrong, PauseAI, AISafety.com)...\n');

    const result = await runScript('scripts/sync-communities.ts');
    if (!result.success) {
      console.error('\n  WARNING: Community sync had errors. Continuing...\n');
    }
  } else {
    console.log('\n  Skipping gather phase (--skip-gather)\n');
  }

  // Phase 2: Evaluate
  if (!skipEvaluate) {
    console.log('\n\n--- PHASE 2: AI EVALUATION ---\n');
    console.log('Processing all pending community candidates through Claude...\n');

    const evalResult = await runScript('scripts/evaluate-community.ts', ['--process-queue']);

    if (!evalResult.success) {
      console.error('\n  WARNING: Evaluation phase had errors.\n');
    }
  } else {
    console.log('\n  Skipping evaluate phase (--skip-evaluate)\n');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log(`  COMMUNITY PIPELINE COMPLETE — ${elapsed}s`);
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
