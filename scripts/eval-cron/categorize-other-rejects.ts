/**
 * categorize-other-rejects.ts - Mine the v2 reverify report's per-row
 * reasoning text to bucket the "other content rejects" (everything that
 * isn't an EA/LW group page or an auth-walled / deterministic short-circuit).
 *
 * The v2 pipeline has rich reasoning fields that already classify the basis
 * for each rejection. We use those instead of a second LLM pass — free, fast,
 * and faithful to v2's own judgement.
 *
 * Buckets:
 *   - off-topic       : not AI safety (animal welfare, biosecurity, biz AI,
 *                       generic EA, etc.) → disable
 *   - dead-or-dormant : on/off-topic, but inactive → disable (matches user
 *                       policy: dormant = disable, no exceptions)
 *   - policy-keep     : looks like an active AI-safety-relevant resource
 *                       that v2 rejected purely for "not specific enough" →
 *                       v2 false negative; keep enabled
 *   - borderline      : can't tell from reasoning text → flag for review
 *
 * Output: a Markdown report + a JSON file consumed by apply-disposition.ts.
 *
 * Read-only on the database.
 *
 * Usage:
 *   npx tsx scripts/eval-cron/categorize-other-rejects.ts
 *   npx tsx scripts/eval-cron/categorize-other-rejects.ts --report <path>
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface RowSection {
  title: string;
  id: string | null;
  url: string;
  category: string;
  decidedAt: string;
  stage1Verdict: string;
  stage1Conf: number;
  stage1RedFlags: string;
  stage1Reasoning: string;
  stage2Verdict: string | null;
  stage2RedFlags: string;
  stage2Reasoning: string;
  rawSection: string;
}

interface Categorized {
  row: RowSection;
  bucket: 'off-topic' | 'dead-or-dormant' | 'policy-keep' | 'borderline';
  signals: string[];
  recommendedAction: 'disable' | 'keep-flagged' | 'keep-enabled' | 'review';
}

const REPORT_DIR = path.resolve(process.cwd(), '.context/eval-reports');

function parseArgs() {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--report');
  return { reportPath: ri >= 0 ? args[ri + 1] : undefined };
}

async function findLatestReport(): Promise<string> {
  const entries = await fs.readdir(REPORT_DIR);
  const reports = entries
    .filter(n => n.startsWith('reverify-') && n.endsWith('.md'))
    .sort();
  if (reports.length === 0) throw new Error(`No reverify-*.md found in ${REPORT_DIR}`);
  return path.join(REPORT_DIR, reports[reports.length - 1]);
}

function extractField(section: string, key: string): string {
  const re = new RegExp(`^- \\*\\*${key}\\*\\*: ?(.*)$`, 'm');
  const m = section.match(re);
  return m ? m[1].trim() : '';
}

function parseSections(reportText: string): RowSection[] {
  // Find content-rejected (## ⚠️) section and split by ### headers within it.
  const startMatch = reportText.match(/^## ⚠️[^\n]*$/m);
  if (!startMatch) return [];
  const start = startMatch.index! + startMatch[0].length;
  // Stop at next ## or end of doc
  const rest = reportText.slice(start);
  const endMatch = rest.match(/^## /m);
  const block = endMatch ? rest.slice(0, endMatch.index!) : rest;

  // Split by ### header
  const parts = block.split(/^### /m).slice(1);
  const rows: RowSection[] = [];

  for (const p of parts) {
    const titleEnd = p.indexOf('\n');
    const title = titleEnd >= 0 ? p.slice(0, titleEnd).trim() : p.trim();
    const body = p;

    const url = extractField(body, 'url');
    if (!url) continue;

    const idRaw = extractField(body, 'id');
    const id = idRaw.replace(/`/g, '').trim() || null;

    const stage1V = extractField(body, 'stage1 verdict');
    const stage1Conf = parseFloat(stage1V.match(/conf ([0-9.]+)/)?.[1] || '0') || 0;
    const stage1Verdict = stage1V.split(' ')[0] || '';

    const stage2V = extractField(body, 'stage2 verdict');
    const stage2Verdict = stage2V ? stage2V.split(' ')[0] : null;

    rows.push({
      title,
      id,
      url,
      category: extractField(body, 'category'),
      decidedAt: extractField(body, 'decided at'),
      stage1Verdict,
      stage1Conf,
      stage1RedFlags: extractField(body, 'stage1 red flags'),
      stage1Reasoning: extractField(body, 'stage1 reasoning'),
      stage2Verdict,
      stage2RedFlags: extractField(body, 'stage2 red flags'),
      stage2Reasoning: extractField(body, 'stage2 reasoning'),
      rawSection: '### ' + body,
    });
  }

  return rows;
}

// ─── Filter: keep only "other content rejects" ────────────────

function isEALWGroupPage(url: string): boolean {
  return /forum\.effectivealtruism\.org\/groups\//.test(url) ||
    /lesswrong\.com\/groups\//.test(url);
}

function isDeterministicShortCircuit(row: RowSection): boolean {
  // The reverify markdown itself doesn't expose stage1.shortCircuit explicitly,
  // but the reasoning text from short-circuits is templated. Catch it here.
  const r = row.stage1Reasoning.toLowerCase();
  return (
    r.startsWith('site failed to load') ||
    r.startsWith('site returned http') ||
    r.startsWith('page text matches parked') ||
    /^page has only \d+ visible words/.test(r) ||
    r.includes('is behind authentication. automated evaluation') // auth-walled (those should already be filtered upstream though)
  );
}

// ─── Pattern dictionaries ────────────────────────────────────

const OFF_TOPIC_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'animal-advocacy', re: /\b(farmed animal|animal advocacy|animal welfare|factory farm|veganism|animal rights)\b/i },
  { name: 'biosecurity', re: /\b(biosecurity|biological risk|pandemic|biosafety|biothreat|biorisk)\b/i },
  { name: 'climate', re: /\bclimate change\b/i },
  { name: 'global-health', re: /\b(global health|malaria|deworming|givewell)\b/i },
  { name: 'corporate-ai', re: /\b(corporate ai|ai for business|ai for sales|ai for marketing|ai in management|business growth|product team|biz growth|enterprise ai|customer success)\b/i },
  { name: 'ai-ethics-product', re: /\b(ai ethics design|ethics for product|responsible ai design|ux ai)\b/i },
  { name: 'generic-ai-conf', re: /\b(general ai\/ml|generic ai conference|ai\/ml conference|machine learning conference|developer conference)\b/i },
  { name: 'general-ea', re: /\b(general (effective altruism|ea)|generic (effective altruism|ea)|broader effective altruism|broad ea community|broader ea movement|ea community group|ea club)\b/i },
  { name: 'general-rationality', re: /\b(general rationality|rationality (book club|reading group)|acx (book|reading)|book club|social meetup)\b/i },
  { name: 'creative-coworking', re: /\b(coworking|maker space|hacker house|creative space)\b/i },
  { name: 'crypto', re: /\b(crypto|cryptocurrency|web3|nft|blockchain)\b/i },
  { name: 'broader-xrisk', re: /\b(broader x-risk|broader existential risk|long view|long-term risk)(?!.*\bai\b)/i },
];

const DEAD_DORMANT_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'no-upcoming', re: /\b(no upcoming events|no scheduled events|no events scheduled|no upcoming dates|nothing actionable)\b/i },
  { name: 'paused', re: /\b(on (pause|hiatus|hold)|currently paused|temporarily inactive|no longer active|on a (pause|hiatus))\b/i },
  { name: 'shell', re: /\b(shell( with)?|empty (description|body|page)|nearly[- ]empty|minimal content|placeholder)\b/i },
  { name: 'old-activity', re: /\b(most recent (activity|event|post) (was|is) .{0,40}(2019|2020|2021|2022|2023)\b|over (2|3|4|5) years ago|years out of date|stale|abandoned|dormant)\b/i },
  { name: 'past-event', re: /\b(past event|event has passed|already passed|previously held|event ended)\b/i },
  { name: 'coming-soon', re: /\b(coming soon|under construction|launch(ing)? soon|placeholder)\b/i },
];

const POLICY_KEEP_HINTS: Array<{ name: string; re: RegExp }> = [
  // strong "this IS AI safety" markers
  { name: 'is-ai-safety', re: /\b(specifically (focus(ed|es)|focuses) on ai safety|ai safety[- ](focus|specific)|ai safety org|ai safety community|ai alignment community|ai alignment focus|ai x-risk focus|focused on (ai safety|ai alignment|ai x[- ]risk)|alignment research|alignment forum)\b/i },
  // and "active" markers
  { name: 'is-active', re: /\b(active (community|organization|group)|recent activity|upcoming event|regular meetups|monthly meetups|hosting events|currently running|currently active)\b/i },
];

// ─── Categorization logic ────────────────────────────────────

function categorize(row: RowSection): Categorized {
  const text = (row.stage1RedFlags + ' ' + row.stage1Reasoning + ' ' +
    row.stage2RedFlags + ' ' + row.stage2Reasoning).toLowerCase();
  const signals: string[] = [];

  // Quick wins: high-confidence broken (in case any leak through deterministic filter).
  // Be careful — Claude mentions "HTTP 200" in routine reasoning, so we only match
  // failure-side HTTP codes and actual broken-URL markers.
  if (
    /\bhttp [45]\d{2}\b/i.test(text) ||
    /\b(econnrefused|dns failure|connection refused|page not found|404 not found|domain parked|domain for sale|enotfound)\b/i.test(text)
  ) {
    signals.push('signals-broken');
    return {
      row,
      bucket: 'dead-or-dormant',
      signals,
      recommendedAction: 'disable',
    };
  }

  // Off-topic detection
  let offTopicHits = 0;
  for (const p of OFF_TOPIC_PATTERNS) {
    if (p.re.test(text)) {
      signals.push(`off-topic:${p.name}`);
      offTopicHits++;
    }
  }

  // Dead/dormant detection
  let dormantHits = 0;
  for (const p of DEAD_DORMANT_PATTERNS) {
    if (p.re.test(text)) {
      signals.push(`dormant:${p.name}`);
      dormantHits++;
    }
  }

  // Policy-keep detection (active AI-safety-specific)
  let policyHits = 0;
  for (const p of POLICY_KEEP_HINTS) {
    if (p.re.test(text)) {
      signals.push(`policy:${p.name}`);
      policyHits++;
    }
  }

  // ─── Decision tree ─────────────────────────────────────────

  // 1) If off-topic with no AI-safety counter-signal → disable as off-topic
  if (offTopicHits > 0 && policyHits < 2) {
    return {
      row,
      bucket: 'off-topic',
      signals,
      recommendedAction: 'disable',
    };
  }

  // 2) If dormant signals present → disable as dormant (per user policy: even
  //    AI-safety dormants get disabled).
  if (dormantHits > 0) {
    return {
      row,
      bucket: 'dead-or-dormant',
      signals,
      recommendedAction: 'disable',
    };
  }

  // 3) If strong AI-safety + active signals AND no off-topic/dormant → policy-keep
  if (policyHits >= 2 && offTopicHits === 0 && dormantHits === 0) {
    return {
      row,
      bucket: 'policy-keep',
      signals,
      recommendedAction: 'keep-enabled',
    };
  }

  // 4) Default: borderline. Include AI-safety hint + some signals but not strong enough.
  return {
    row,
    bucket: 'borderline',
    signals,
    recommendedAction: 'review',
  };
}

// ─── Output ──────────────────────────────────────────────────

function fmtRow(c: Categorized): string {
  const r = c.row;
  const reason = (r.stage1Reasoning || '').replace(/\|/g, '\\|').slice(0, 180);
  const title = (r.title || '').replace(/\|/g, '\\|').slice(0, 50);
  return `| ${c.bucket} | ${r.category} | ${title} | ${r.url} | ${c.signals.slice(0, 4).join(', ') || '—'} | ${reason}… |`;
}

function buildReport(cats: Categorized[], reportSource: string, now: Date): string {
  const counts = { 'off-topic': 0, 'dead-or-dormant': 0, 'policy-keep': 0, borderline: 0 };
  for (const c of cats) counts[c.bucket]++;

  const lines: string[] = [];
  lines.push(`# Other content rejects — categorization (text-mined)`);
  lines.push('');
  lines.push(`Generated: ${now.toISOString()}`);
  lines.push(`Source report: \`${reportSource}\``);
  lines.push('');
  lines.push(`Reviewed **${cats.length}** rows that v2 rejected on content (excluding EA/LW group pages and deterministic short-circuits).`);
  lines.push('');
  lines.push(`- 🚫 **off-topic**: ${counts['off-topic']}  → disable (animal welfare, biosec, biz AI, generic EA, etc.)`);
  lines.push(`- 💀 **dead-or-dormant**: ${counts['dead-or-dormant']}  → disable (no upcoming events, paused, shell, stale)`);
  lines.push(`- ✅ **policy-keep**: ${counts['policy-keep']}  → keep enabled (v2 false negative — AI-safety-specific & active)`);
  lines.push(`- ❓ **borderline**: ${counts.borderline}  → flag for manual review`);
  lines.push('');

  const sections: Array<[Categorized['bucket'], string]> = [
    ['policy-keep', '✅ Policy-keep (v2 false negatives — recommend KEEP enabled)'],
    ['borderline', '❓ Borderline (manual review)'],
    ['off-topic', '🚫 Off-topic (recommend DISABLE)'],
    ['dead-or-dormant', '💀 Dead or dormant (recommend DISABLE)'],
  ];
  for (const [bucket, header] of sections) {
    const rows = cats.filter(c => c.bucket === bucket);
    lines.push(`## ${header}  (${rows.length})`);
    lines.push('');
    if (rows.length === 0) {
      lines.push('_None._');
      lines.push('');
      continue;
    }
    lines.push('| bucket | category | title | url | signals | reasoning (truncated) |');
    lines.push('|---|---|---|---|---|---|');
    rows.sort((a, b) => a.row.title.localeCompare(b.row.title));
    for (const c of rows) lines.push(fmtRow(c));
    lines.push('');
  }
  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const { reportPath } = parseArgs();
  const reportFile = reportPath ?? (await findLatestReport());
  console.log(`Source report: ${reportFile}`);

  const text = await fs.readFile(reportFile, 'utf8');
  const allRows = parseSections(text);
  console.log(`Parsed ${allRows.length} per-row sections from content-rejected.`);

  const filtered = allRows.filter(r =>
    !isEALWGroupPage(r.url) && !isDeterministicShortCircuit(r),
  );
  console.log(`After filtering EA/LW groups + deterministic short-circuits: ${filtered.length}`);

  const cats = filtered.map(categorize);

  const counts = { 'off-topic': 0, 'dead-or-dormant': 0, 'policy-keep': 0, borderline: 0 };
  for (const c of cats) counts[c.bucket]++;

  console.log('\nCategorization buckets:');
  console.log(`  🚫 off-topic:        ${counts['off-topic']}`);
  console.log(`  💀 dead-or-dormant:  ${counts['dead-or-dormant']}`);
  console.log(`  ✅ policy-keep:      ${counts['policy-keep']}`);
  console.log(`  ❓ borderline:       ${counts.borderline}`);

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-');
  const outMd = path.join(REPORT_DIR, `other-rejects-${ts}.md`);
  await fs.writeFile(outMd, buildReport(cats, reportFile, now));

  const outJson = outMd.replace(/\.md$/, '.json');
  await fs.writeFile(
    outJson,
    JSON.stringify(
      cats.map(c => ({
        id: c.row.id,
        url: c.row.url,
        category: c.row.category,
        title: c.row.title,
        bucket: c.bucket,
        recommendedAction: c.recommendedAction,
        signals: c.signals,
        stage1Conf: c.row.stage1Conf,
        decidedAt: c.row.decidedAt,
      })),
      null,
      2,
    ),
  );

  console.log(`\n📝 Report:  ${outMd}`);
  console.log(`   JSON:   ${outJson}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
