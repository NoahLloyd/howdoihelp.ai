/**
 * evaluate-pipeline.ts - Orchestrator for the v2 two-stage evaluator.
 *
 * Stage 1: cheap text gate. Catches dead, parked, off-topic, shell pages.
 * Stage 2: vision gate. Renders the page in a real browser, screenshots it,
 *          and asks Claude with vision whether a human would put this in
 *          an AI-safety directory.
 *
 * Stage 2 runs on every survivor of stage 1 (both `accept` and `borderline`).
 * The failure mode we are protecting against — text-mode evaluator approving
 * a page that visually is junk — only goes away if vision sees every
 * candidate that survives the text gate.
 */

import { scrapeRich, type RichScrape } from './scrape-rich';
import { evaluateStage1, type Stage1Result } from './evaluate-stage1';
import { evaluateStage2, type Stage2Result } from './evaluate-stage2';

export type FinalVerdict = 'accept' | 'reject';

export interface PipelineResult {
  url: string;
  category: 'event' | 'community';
  finalVerdict: FinalVerdict;
  /** Where the verdict was decided. */
  decidedAt: 'stage1-shortcircuit' | 'stage1' | 'stage2';
  scrape: RichScrape;
  stage1: Stage1Result;
  stage2?: Stage2Result;
  /** Total wall-clock seconds. */
  durationSec: number;
}

export interface PipelineOptions {
  /** When provided, save the stage 2 screenshot here. */
  saveScreenshotTo?: string;
  /** When false, skip stage 2 entirely (debugging only). Default true. */
  runStage2?: boolean;
  /** When true, also run stage 2 on stage1=reject (for benchmark debugging). Default false. */
  visionEvenOnReject?: boolean;
}

export async function evaluatePipeline(
  url: string,
  category: 'event' | 'community',
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const t0 = Date.now();
  const runStage2 = opts.runStage2 !== false;

  const scrape = await scrapeRich(url);
  const stage1 = await evaluateStage1({ url, category, scrape });

  // Short-circuit reject-without-vision when EITHER:
  //   (a) a cheap pre-LLM check fired (network error, 4xx, parked, empty), OR
  //   (b) the LLM rejected with very high confidence (≥ 0.95) — clear-cut
  //       cases like "obviously off-topic", "obviously a past event", etc.
  // Any other LLM verdict (accept, borderline, lower-confidence reject)
  // escalates to vision, because text-mode reasoning can be over-strict on
  // JS-heavy pages where the static HTML looks shell-y but rendered shows
  // real content.
  const STAGE1_REJECT_VERY_CONFIDENT = 0.95;
  const shortCircuitReject =
    stage1.verdict === 'reject' &&
    (stage1.shortCircuit || stage1.confidence >= STAGE1_REJECT_VERY_CONFIDENT);

  if (shortCircuitReject && !opts.visionEvenOnReject) {
    return {
      url,
      category,
      finalVerdict: 'reject',
      decidedAt: stage1.shortCircuit ? 'stage1-shortcircuit' : 'stage1',
      scrape,
      stage1,
      durationSec: (Date.now() - t0) / 1000,
    };
  }

  if (!runStage2) {
    return {
      url,
      category,
      finalVerdict: stage1.verdict === 'accept' ? 'accept' : 'reject',
      decidedAt: 'stage1',
      scrape,
      stage1,
      durationSec: (Date.now() - t0) / 1000,
    };
  }

  const stage2 = await evaluateStage2({
    url,
    category,
    saveScreenshotTo: opts.saveScreenshotTo,
  });

  return {
    url,
    category,
    finalVerdict: stage2.verdict,
    decidedAt: 'stage2',
    scrape,
    stage1,
    stage2,
    durationSec: (Date.now() - t0) / 1000,
  };
}
