/**
 * run.ts - Benchmark harness for the v2 evaluator.
 *
 * Runs every case in cases.ts through the v2 pipeline and prints a report
 * comparing the produced verdict to the expected verdict. Screenshots from
 * stage 2 are saved under .context/screenshots/ for debugging.
 *
 * Usage:
 *   npx tsx scripts/eval-bench/run.ts
 *   npx tsx scripts/eval-bench/run.ts --no-stage2     # skip vision (cheap)
 *   npx tsx scripts/eval-bench/run.ts --only luma     # filter by URL substring
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { CASES, type BenchmarkCase } from './cases';
import { evaluatePipeline, type PipelineResult } from '../lib/evaluate-pipeline';
import { closeBrowser } from '../lib/evaluate-stage2';

const SCREENSHOT_DIR = path.resolve(process.cwd(), '.context/screenshots');

function safeName(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 80);
}

function color(s: string, c: 'red' | 'green' | 'yellow' | 'gray' | 'cyan' | 'bold'): string {
  const codes: Record<typeof c, string> = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    gray: '\x1b[90m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
  };
  return `${codes[c]}${s}\x1b[0m`;
}

function fmtVerdict(v: 'accept' | 'reject'): string {
  return v === 'accept' ? color('accept', 'green') : color('reject', 'red');
}

async function runOne(c: BenchmarkCase): Promise<{ case: BenchmarkCase; result: PipelineResult; pass: boolean }> {
  const screenshotPath = path.join(SCREENSHOT_DIR, `${safeName(c.url)}.png`);
  const result = await evaluatePipeline(c.url, c.pipelineCategory, {
    saveScreenshotTo: screenshotPath,
  });
  return { case: c, result, pass: result.finalVerdict === c.expected };
}

function printResult(row: { case: BenchmarkCase; result: PipelineResult; pass: boolean }): void {
  const { case: c, result, pass } = row;
  const tick = pass ? color('PASS', 'green') : color('FAIL', 'red');
  console.log(`${tick} ${color(c.url, 'bold')}`);
  console.log(
    `   expected=${fmtVerdict(c.expected)}  got=${fmtVerdict(result.finalVerdict)}  ` +
      `category=${color(c.category, 'cyan')}  decided-at=${color(result.decidedAt, 'gray')}  ` +
      `time=${result.durationSec.toFixed(1)}s`,
  );
  console.log(color(`   why: ${c.rationale}`, 'gray'));

  // Stage 1 detail
  console.log(
    color(
      `   stage1: ${result.stage1.verdict}  alive=${result.stage1.is_alive}  on_topic=${result.stage1.is_on_topic}  ` +
        `recent=${result.stage1.has_recent_activity}  conf=${result.stage1.confidence.toFixed(2)}`,
      'gray',
    ),
  );
  if (result.stage1.red_flags.length) {
    console.log(color(`   stage1 red flags: ${result.stage1.red_flags.join('; ')}`, 'gray'));
  }
  console.log(color(`   stage1 reasoning: ${result.stage1.reasoning}`, 'gray'));

  // Stage 2 detail
  if (result.stage2) {
    console.log(
      color(
        `   stage2: ${result.stage2.verdict}  conf=${result.stage2.confidence.toFixed(2)}` +
          (result.stage2.screenshotPath ? `  screenshot=${result.stage2.screenshotPath}` : ''),
        'gray',
      ),
    );
    if (result.stage2.red_flags.length) {
      console.log(color(`   stage2 red flags: ${result.stage2.red_flags.join('; ')}`, 'gray'));
    }
    console.log(color(`   stage2 reasoning: ${result.stage2.reasoning}`, 'gray'));
  }
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const noStage2 = args.includes('--no-stage2');
  const onlyIdx = args.indexOf('--only');
  const onlyFilter = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

  const cases = onlyFilter ? CASES.filter(c => c.url.includes(onlyFilter)) : CASES;
  console.log(color(`\n=== Running ${cases.length} benchmark cases (stage 2: ${noStage2 ? 'OFF' : 'ON'}) ===\n`, 'bold'));

  const results: Array<{ case: BenchmarkCase; result: PipelineResult; pass: boolean }> = [];
  for (const c of cases) {
    process.stdout.write(color(`→ ${c.url}\n`, 'cyan'));
    try {
      const result = await evaluatePipeline(c.url, c.pipelineCategory, {
        saveScreenshotTo: path.join(SCREENSHOT_DIR, `${safeName(c.url)}.png`),
        runStage2: !noStage2,
      });
      results.push({ case: c, result, pass: result.finalVerdict === c.expected });
    } catch (err: any) {
      console.error(color(`  💥 pipeline crashed for ${c.url}: ${err.message}`, 'red'));
    }
  }

  await closeBrowser();

  // ─── Report ───────────────────────────────────────────────
  console.log(color('\n=== Results ===\n', 'bold'));
  for (const r of results) printResult(r);

  const passed = results.filter(r => r.pass).length;
  const failed = results.length - passed;
  console.log(color(`\nSummary: ${passed}/${results.length} passed, ${failed} failed.\n`, 'bold'));

  // Bucket by category for failure diagnosis
  const byCategory: Record<string, { passed: number; failed: number }> = {};
  for (const r of results) {
    const key = r.case.category;
    byCategory[key] ||= { passed: 0, failed: 0 };
    if (r.pass) byCategory[key].passed++;
    else byCategory[key].failed++;
  }
  for (const [cat, n] of Object.entries(byCategory)) {
    const status = n.failed === 0 ? color('OK', 'green') : color('FAIL', 'red');
    console.log(`  ${cat.padEnd(28)}  ${n.passed}/${n.passed + n.failed}  ${status}`);
  }
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async err => {
  console.error('Fatal:', err);
  await closeBrowser().catch(() => undefined);
  process.exit(1);
});
