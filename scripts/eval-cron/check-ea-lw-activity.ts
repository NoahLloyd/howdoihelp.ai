/**
 * check-ea-lw-activity.ts - Classify EA Forum + LessWrong group rejects from
 * the v2 reverify report by their actual activity, using the public GraphQL
 * APIs.
 *
 * The v2 pipeline rejected ~233 EA/LW group pages mostly on policy ("not
 * specifically AI safety"), not on liveness. For places without a dedicated
 * AI safety community, these chapter pages may still be the best local
 * touch-point — IF they're actually active. This script answers that.
 *
 * Reads the most recent reverify report, extracts EA/LW group IDs from the
 * rejected URLs, queries each group via GraphQL for its events/posts, and
 * buckets into:
 *   - active     : ≥1 upcoming event OR ≥1 post in the last 6 months
 *   - semi-active: ≥1 post in the last 24 months but nothing upcoming or recent
 *   - dormant    : zero posts in the last 24 months and no upcoming events
 *
 * Output: a Markdown report at .context/eval-reports/ea-lw-activity-<ts>.md
 * The script does NOT write to the database — read-only.
 *
 * Usage:
 *   npx tsx scripts/eval-cron/check-ea-lw-activity.ts                  # use latest reverify report
 *   npx tsx scripts/eval-cron/check-ea-lw-activity.ts --report <path>  # use a specific report
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface GroupRef {
  source: 'ea-forum' | 'lesswrong';
  id: string;
  url: string;
}

interface Post {
  _id: string;
  title: string;
  postedAt: string;
  isEvent: boolean;
  startTime: string | null;
}

interface GroupActivity {
  ref: GroupRef;
  // From localgroup query
  name: string | null;
  location: string | null;
  inactive: boolean | null;
  lastActivity: string | null;
  // From posts query
  posts: Post[];
  // Summary
  upcomingEvents: number;
  postsLast6m: number;
  postsLast24m: number;
  classification: 'active' | 'semi-active' | 'dormant';
  reason: string;
  fetchError: string | null;
}

const REPORT_DIR = path.resolve(process.cwd(), '.context/eval-reports');
const CONCURRENCY = 8;

const HOSTS: Record<GroupRef['source'], string> = {
  'ea-forum': 'forum.effectivealtruism.org',
  lesswrong: 'www.lesswrong.com',
};

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

function extractGroupRefs(reportText: string): GroupRef[] {
  const refs: GroupRef[] = [];
  const seen = new Set<string>();
  const re = /\| reject [^|]*\| ?(?:communities|events) ?\| ?(https?:\/\/[^| ]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(reportText)) !== null) {
    const url = m[1].trim();
    let source: GroupRef['source'] | null = null;
    let id: string | null = null;
    const ea = url.match(/forum\.effectivealtruism\.org\/groups\/([A-Za-z0-9]+)/);
    const lw = url.match(/(?:www\.)?lesswrong\.com\/groups\/([A-Za-z0-9]+)/);
    if (ea) {
      source = 'ea-forum';
      id = ea[1];
    } else if (lw) {
      source = 'lesswrong';
      id = lw[1];
    }
    if (source && id && !seen.has(`${source}:${id}`)) {
      seen.add(`${source}:${id}`);
      refs.push({ source, id, url });
    }
  }
  return refs;
}

async function gqlPost(host: string, query: string, variables?: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://${host}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${host}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors).slice(0, 200)}`);
  return json.data;
}

async function fetchGroup(ref: GroupRef): Promise<{
  name: string | null;
  location: string | null;
  inactive: boolean | null;
  lastActivity: string | null;
}> {
  const host = HOSTS[ref.source];
  const data = await gqlPost(
    host,
    `query G($id: String!) {
      localgroup(input: { selector: { documentId: $id } }) {
        result { _id name location inactive lastActivity }
      }
    }`,
    { id: ref.id },
  );
  const r = data?.localgroup?.result;
  if (!r) return { name: null, location: null, inactive: null, lastActivity: null };
  return {
    name: r.name ?? null,
    location: r.location ?? null,
    inactive: typeof r.inactive === 'boolean' ? r.inactive : null,
    lastActivity: r.lastActivity ?? null,
  };
}

async function fetchPosts(ref: GroupRef, limit = 30): Promise<Post[]> {
  const host = HOSTS[ref.source];
  const query = `{
    posts(input: { terms: { view: "groupPosts", groupId: "${ref.id}", limit: ${limit} } }) {
      results { _id title postedAt isEvent startTime }
    }
  }`;
  const data = await gqlPost(host, query);
  const results = data?.posts?.results || [];
  return results.map((p: any) => ({
    _id: p._id,
    title: String(p.title || ''),
    postedAt: String(p.postedAt || ''),
    isEvent: Boolean(p.isEvent),
    startTime: p.startTime ?? null,
  }));
}

function classify(group: GroupActivity): { classification: 'active' | 'semi-active' | 'dormant'; reason: string } {
  if (group.inactive === true) {
    return { classification: 'dormant', reason: 'Group flagged inactive=true on the forum' };
  }
  if (group.upcomingEvents > 0) {
    return {
      classification: 'active',
      reason: `${group.upcomingEvents} upcoming event(s) on calendar`,
    };
  }
  if (group.postsLast6m > 0) {
    return {
      classification: 'active',
      reason: `${group.postsLast6m} post(s)/event(s) in the last 6 months`,
    };
  }
  if (group.postsLast24m > 0) {
    return {
      classification: 'semi-active',
      reason: `${group.postsLast24m} post(s) in last 24 months but none in the last 6, no upcoming`,
    };
  }
  return {
    classification: 'dormant',
    reason: 'Zero posts/events in the last 24 months, none upcoming',
  };
}

async function processOne(ref: GroupRef, now: Date): Promise<GroupActivity> {
  const sixMonthsAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30 * 6);
  const twentyFourMonthsAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30 * 24);

  const base: GroupActivity = {
    ref,
    name: null,
    location: null,
    inactive: null,
    lastActivity: null,
    posts: [],
    upcomingEvents: 0,
    postsLast6m: 0,
    postsLast24m: 0,
    classification: 'dormant',
    reason: '',
    fetchError: null,
  };

  try {
    const [meta, posts] = await Promise.all([fetchGroup(ref), fetchPosts(ref)]);
    Object.assign(base, meta);
    base.posts = posts;

    for (const p of posts) {
      const postedAt = p.postedAt ? new Date(p.postedAt) : null;
      const startTime = p.startTime ? new Date(p.startTime) : null;
      if (p.isEvent && startTime && startTime >= now) base.upcomingEvents++;
      if (postedAt && postedAt >= sixMonthsAgo) base.postsLast6m++;
      if (postedAt && postedAt >= twentyFourMonthsAgo) base.postsLast24m++;
    }
  } catch (err: any) {
    base.fetchError = err?.message || String(err);
  }

  const c = classify(base);
  base.classification = c.classification;
  base.reason = base.fetchError ? `Fetch failed: ${base.fetchError}` : c.reason;
  if (base.fetchError) base.classification = 'dormant';
  return base;
}

async function processBatch(refs: GroupRef[], concurrency: number, now: Date): Promise<GroupActivity[]> {
  const results: GroupActivity[] = new Array(refs.length);
  let i = 0;
  let done = 0;
  async function worker(): Promise<void> {
    while (i < refs.length) {
      const idx = i++;
      results[idx] = await processOne(refs[idx], now);
      done++;
      if (done % 20 === 0 || done === refs.length) {
        process.stdout.write(`\r  Processed ${done}/${refs.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, refs.length) }, () => worker()));
  return results;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return d.slice(0, 10);
}

function fmtRow(g: GroupActivity): string {
  const name = (g.name || '(no name)').replace(/\|/g, '\\|').slice(0, 50);
  const loc = (g.location || '—').replace(/\|/g, '\\|').slice(0, 30);
  return `| ${g.classification} | ${g.ref.source} | ${name} | ${loc} | ${g.upcomingEvents} | ${g.postsLast6m} | ${g.postsLast24m} | ${fmtDate(g.lastActivity)} | ${g.ref.url} | ${g.reason.replace(/\|/g, '\\|')} |`;
}

function buildReport(groups: GroupActivity[], reportSource: string, now: Date): string {
  const counts = { active: 0, 'semi-active': 0, dormant: 0 };
  for (const g of groups) counts[g.classification]++;
  const fetchFailures = groups.filter(g => g.fetchError).length;

  const lines: string[] = [];
  lines.push(`# EA Forum / LessWrong activity classification — ${now.toISOString()}`);
  lines.push('');
  lines.push(`Source report: \`${reportSource}\``);
  lines.push('');
  lines.push(`Checked **${groups.length}** EA/LW group rejects via public GraphQL.`);
  lines.push('');
  lines.push(`- ✅ **active**: ${counts.active}  (≥1 upcoming event OR ≥1 post in the last 6 months)`);
  lines.push(`- 🟡 **semi-active**: ${counts['semi-active']}  (≥1 post in the last 24 months, none recent or upcoming)`);
  lines.push(`- 💀 **dormant**: ${counts.dormant}  (zero posts in last 24 months and nothing upcoming)`);
  if (fetchFailures > 0) {
    lines.push(`- ⚠️ fetch errors: ${fetchFailures}  (counted as dormant; see notes column)`);
  }
  lines.push('');
  lines.push('## Recommended actions');
  lines.push('');
  lines.push('- **active**: keep `enabled = true` in the directory.');
  lines.push('- **semi-active**: set `enabled = false`, but keep flagged for review.');
  lines.push('- **dormant**: set `enabled = false`.');
  lines.push('');

  // Sections
  const sections: Array<['active' | 'semi-active' | 'dormant', string]> = [
    ['active', '✅ Active'],
    ['semi-active', '🟡 Semi-active (disable + flag)'],
    ['dormant', '💀 Dormant (disable)'],
  ];
  for (const [bucket, header] of sections) {
    const rows = groups.filter(g => g.classification === bucket);
    lines.push(`## ${header}  (${rows.length})`);
    lines.push('');
    if (rows.length === 0) {
      lines.push('_None._');
      lines.push('');
      continue;
    }
    lines.push('| bucket | source | name | location | upcoming | posts/6m | posts/24m | lastActivity | url | reason |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|');
    rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    for (const g of rows) lines.push(fmtRow(g));
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  const { reportPath } = parseArgs();
  const reportFile = reportPath ?? (await findLatestReport());
  console.log(`Source report: ${reportFile}`);

  const reportText = await fs.readFile(reportFile, 'utf8');
  const refs = extractGroupRefs(reportText);
  console.log(`Found ${refs.length} EA/LW group rejects in the report.`);

  const eaCount = refs.filter(r => r.source === 'ea-forum').length;
  const lwCount = refs.filter(r => r.source === 'lesswrong').length;
  console.log(`  EA Forum: ${eaCount}`);
  console.log(`  LessWrong: ${lwCount}`);
  console.log('');

  const now = new Date();
  console.log(`Querying GraphQL APIs (concurrency=${CONCURRENCY})...`);
  const groups = await processBatch(refs, CONCURRENCY, now);
  console.log('');

  const counts = { active: 0, 'semi-active': 0, dormant: 0 };
  for (const g of groups) counts[g.classification]++;
  console.log(`\nResult buckets:`);
  console.log(`  ✅ active:      ${counts.active}`);
  console.log(`  🟡 semi-active: ${counts['semi-active']}`);
  console.log(`  💀 dormant:     ${counts.dormant}`);

  const ts = now.toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(REPORT_DIR, `ea-lw-activity-${ts}.md`);
  await fs.writeFile(outPath, buildReport(groups, reportFile, now));
  console.log(`\n📝 Report written to ${outPath}`);

  // Also dump raw JSON for downstream scripting (apply enables/disables later)
  const jsonPath = outPath.replace(/\.md$/, '.json');
  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      groups.map(g => ({
        source: g.ref.source,
        id: g.ref.id,
        url: g.ref.url,
        name: g.name,
        location: g.location,
        inactive: g.inactive,
        lastActivity: g.lastActivity,
        upcomingEvents: g.upcomingEvents,
        postsLast6m: g.postsLast6m,
        postsLast24m: g.postsLast24m,
        classification: g.classification,
        reason: g.reason,
        fetchError: g.fetchError,
      })),
      null,
      2,
    ),
  );
  console.log(`   (machine-readable JSON: ${jsonPath})`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
