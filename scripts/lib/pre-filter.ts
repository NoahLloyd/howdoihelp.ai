/**
 * pre-filter.ts - Whitelist-based filter that only keeps events with
 * positive AI safety signals before they reach the AI evaluator.
 *
 * Logic: an event is kept ONLY if it contains at least one recognized
 * AI safety keyword/phrase or known organization name anywhere in its
 * title, description, or source_org. Everything else is rejected.
 *
 * This is intentionally generous - the AI evaluator handles nuance.
 * The goal is to filter out the 80%+ of results that are clearly
 * unrelated (generic tech meetups, business AI, crypto, etc.) without
 * ever dropping a legitimate safety event.
 */

import type { GatheredEvent } from './insert-candidates';

export interface PreFilterResult {
  kept: GatheredEvent[];
  rejected: { event: GatheredEvent; reason: string }[];
}

// ─── Whitelist: positive signals ─────────────────────────────
// An event must contain at least ONE of these anywhere in
// title + description + source_org to pass the filter.

/** Community-specific vocabulary that almost never appears outside AI safety */
const SAFETY_PHRASES = [
  // Core AI safety terms
  'ai safety',
  'ai alignment',
  'alignment research',
  'alignment problem',
  'alignment tax',
  'aligned ai',
  'misaligned ai',
  'misalignment',
  'ai risk',
  'ai risks',
  'agi safety',
  'agi risk',
  'safety research',

  // Existential / catastrophic risk
  'existential risk',
  'xrisk',
  'global catastrophic risk',
  'catastrophic ai',
  'ai catastrophe',
  'extinction risk',
  'human extinction',
  'ai doom',
  'ai existential',
  'existential threat',
  'civilizational risk',

  // Technical safety concepts
  'interpretability',
  'mechanistic interpretability',
  'mech interp',
  'scalable oversight',
  'reward hacking',
  'reward misspecification',
  'goal misgeneralization',
  'inner alignment',
  'outer alignment',
  'mesa-optimizer',
  'mesa optimizer',
  'deceptive alignment',
  'corrigibility',
  'corrigible',
  'value alignment',
  'value loading',
  'ai control',
  'ai containment',
  'instrumental convergence',
  'power seeking',
  'power-seeking',
  'treacherous turn',
  'specification gaming',
  'goodhart',
  'eliciting latent knowledge',
  'iterated amplification',
  'constitutional ai',
  'rlhf safety',
  'red teaming ai',
  'adversarial robustness',
  'distributional shift',
  'out of distribution',
  'tool ai',
  'oracle ai',
  'ai boxing',
  'wireheading',
  'utility function',
  'paperclip',
  'paperclip maximizer',
  'orthogonality thesis',
  'convergent instrumental',
  'coherent extrapolated volition',
  'unfriendly ai',
  'foom',
  'intelligence explosion',
  'recursive self-improvement',
  'takeoff speed',
  'slow takeoff',
  'fast takeoff',
  'hard takeoff',
  'soft takeoff',
  'compute governance',
  'evals for ai',
  'ai evaluations',
  'dangerous capabilities',
  'capability elicitation',
  'sandbagging',
  'scheming',
  'situational awareness',
  'model organisms',

  // Governance & policy (safety-specific)
  'ai governance',
  'ai policy',
  'ai regulation',
  'ai moratorium',
  'pause ai',
  'frontier ai',
  'frontier model',
  'responsible scaling',
  'responsible ai development',
  'ai safety institute',
  'compute governance',

  // EA / rationality community
  'effective altruism',
  'effective altruist',
  'ea global',
  'eagx',
  'ea community',
  'rationalist',
  'rationality',
  'lesswrong',
  'less wrong',
  'overcoming bias',
  'longtermism',
  'longtermist',
  'long-termism',
  'long-termist',
  'biosecurity',
  'global priorities',
  'cause prioritization',
  'earning to give',
  'marginal impact',
  '80,000 hours',
  '80000 hours',
  'giving what we can',
  'high-impact career',

  // Superintelligence / AGI discourse
  'superintelligence',
  'superintelligent',
  'artificial general intelligence',
  'transformative ai',
  'tai risk',
  'agi timeline',
  'technological singularity',
];

/** Known AI safety organizations - long/unique names safe for substring matching */
const KNOWN_ORGS_SUBSTRING = [
  // Research labs & institutes
  'mats program',
  'apart research',
  'redwood research',
  'anthropic',
  'center for ai safety',
  'centre for ai safety',
  'alignment research center',
  'arc evals',
  'chai berkeley',
  'center for human-compatible ai',
  'centre for human-compatible ai',
  'machine intelligence research institute',
  'future of humanity institute',
  'future of life institute',
  'leverhulme centre',
  'global catastrophic risk institute',
  'center for security and emerging technology',
  'institute for ai policy and strategy',
  'centre for the governance of ai',
  'governance of ai',
  'epoch ai',
  'ai safety hub',
  'foresight institute',
  'cesia',

  // EA orgs
  'open philanthropy',
  'effective ventures',
  'centre for effective altruism',
  'center for effective altruism',
  'giving what we can',
  '80,000 hours',
  '80000 hours',
  'ea forum',
  'rethink priorities',

  // Programs & fellowships
  'bluedot impact',
  'interact fellowship',
  'ai safety camp',
  'alignment jam',
  'non-trivial',
  'aisafety.com',
  'aisafety.info',

  // Policy & advocacy
  'pause ai',
  'ai safety institute',
  'nist ai',

  // Community hubs
  'lesswrong',
  'less wrong',
  'ea london',
  'ea nyc',
  'ea bay area',
  'ea oxford',
  'ea cambridge',

  // One-word / slug variants
  'aisafety',
  'pauseai',
  'apartresearch',
  'alignmentjam',
];

/** Short phrases that need word-boundary matching to avoid false positives */
const PHRASES_WORD_BOUNDARY = [
  'x risk',      // not "tax risk"
  'x-risk',      // same after normalize
  'stop ai',     // AI pause/safety movement
];

/** Short/ambiguous org names - must match as whole words to avoid false positives */
const KNOWN_ORGS_WORD_BOUNDARY = [
  'mats',       // not inside "formats"
  'cais',       // not inside "escalais"
  'miri',       // fairly unique
  'fhi',        // not inside "fishing"
  'fli',        // not inside "flight"
  'gcri',
  'cset',
  'govai',
  'conjecture ai',
  'aisi',        // not inside "fundraising"
  'uk aisi',
  'us aisi',
  'far ai',
  'bluedot',
  'pibbss',
  'saige',
  'rand ai',
  'ea sf',      // "ea" alone is too common but "ea sf" is specific
  'rationalist',
];

// ─── Build lookup structures ─────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\n\r\t]+/g, ' ')
    // Normalize hyphens/underscores to spaces so "pause-ai" matches "pause ai"
    .replace(/[-_]+/g, ' ')
    // Normalize & to spaces so "AI & Safety" becomes "ai  safety"
    .replace(/&/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

// Pre-compile word-boundary regexes
const PHRASE_WB_REGEXES = PHRASES_WORD_BOUNDARY.map(phrase => ({
  phrase,
  regex: new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
}));

const ORG_WB_REGEXES = KNOWN_ORGS_WORD_BOUNDARY.map(org => ({
  org,
  regex: new RegExp(`\\b${org.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
}));

function hasPositiveSignal(event: GatheredEvent): { found: boolean; matchedTerm?: string } {
  const title = normalize(event.title);
  const description = normalize(event.description || '');
  const sourceOrg = normalize(event.source_org || '');
  const combined = `${title} ${description} ${sourceOrg}`;

  // 1. Check known orgs (substring-safe ones) against source_org field
  for (const org of KNOWN_ORGS_SUBSTRING) {
    if (sourceOrg.includes(org)) {
      return { found: true, matchedTerm: `org: ${org}` };
    }
  }

  // 2. Check word-boundary orgs against source_org
  for (const { org, regex } of ORG_WB_REGEXES) {
    if (regex.test(sourceOrg)) {
      return { found: true, matchedTerm: `org: ${org}` };
    }
  }

  // 3. Check all safety phrases against combined text
  for (const phrase of SAFETY_PHRASES) {
    if (combined.includes(phrase)) {
      return { found: true, matchedTerm: phrase };
    }
  }

  // 3b. Check word-boundary safety phrases
  for (const { phrase, regex } of PHRASE_WB_REGEXES) {
    if (regex.test(combined)) {
      return { found: true, matchedTerm: phrase };
    }
  }

  // 4. Check substring-safe org names in combined text
  for (const org of KNOWN_ORGS_SUBSTRING) {
    if (combined.includes(org)) {
      return { found: true, matchedTerm: `mentions org: ${org}` };
    }
  }

  // 5. Check word-boundary org names in combined text
  for (const { org, regex } of ORG_WB_REGEXES) {
    if (regex.test(combined)) {
      return { found: true, matchedTerm: `mentions org: ${org}` };
    }
  }

  return { found: false };
}

// ─── Public API ──────────────────────────────────────────────

export function preFilter(events: GatheredEvent[]): PreFilterResult {
  const kept: GatheredEvent[] = [];
  const rejected: { event: GatheredEvent; reason: string }[] = [];

  for (const event of events) {
    const signal = hasPositiveSignal(event);
    if (signal.found) {
      kept.push(event);
    } else {
      rejected.push({
        event,
        reason: 'no AI safety signal found in title, description, or source',
      });
    }
  }

  return { kept, rejected };
}