/**
 * apply-disposition.ts - Compute and (optionally) apply DB updates from the
 * v2 reverify + EA/LW activity + other-rejects + auth-walled classifications.
 *
 * Reads the four most recent classification artifacts:
 *   1. reverify-<ts>.md       - v2 outcome (accepts, content-rejects, auth-walled)
 *   2. ea-lw-activity-<ts>.json
 *   3. other-rejects-<ts>.json
 *   4. authwalled-liveness-<ts>.json
 *
 * Computes per-row dispositions, prints a diff against current DB state,
 * and (with --apply) writes them.
 *
 * Default is DRY-RUN. --apply is required to actually mutate the DB.
 *
 * Disposition tags written to verification_notes:
 *   v2-accept              - boost: activity_score=1.0
 *   v2-policy-keep         - keep: activity_score=0.85
 *   v2-ea-lw-active        - keep, no score change
 *   v2-authwalled-live     - keep, flag for manual review
 *   v2-authwalled-unknown  - keep, flag (render failed / ambiguous)
 *   v2-borderline-flag     - keep, flag for manual review
 *   v2-disabled-broken     - disable (URL dead / HTTP error / parked / network error)
 *   v2-disabled-offtopic   - disable (off-topic content)
 *   v2-disabled-dormant    - disable (no activity, no upcoming events)
 *   v2-disabled-ea-lw-dormant   - disable (EA/LW group with zero forum activity)
 *   v2-disabled-ea-lw-semi-flag - disable + flag (EA/LW group with stale activity)
 *   v2-disabled-authwalled-dead - disable (auth-walled invite expired / 404)
 *
 * Usage:
 *   npx tsx scripts/eval-cron/apply-disposition.ts                # dry-run
 *   npx tsx scripts/eval-cron/apply-disposition.ts --apply        # actually update
 *   npx tsx scripts/eval-cron/apply-disposition.ts --filter accept   # only show accepts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const REPORT_DIR = path.resolve(process.cwd(), '.context/eval-reports');

type DispositionTag =
  | 'v2-accept'
  | 'v2-policy-keep'
  | 'v2-ea-lw-active'
  | 'v2-authwalled-live'
  | 'v2-authwalled-unknown'
  | 'v2-borderline-flag'
  | 'v2-disabled-broken'
  | 'v2-disabled-offtopic'
  | 'v2-disabled-dormant'
  | 'v2-disabled-ea-lw-dormant'
  | 'v2-disabled-ea-lw-semi-flag'
  | 'v2-disabled-authwalled-dead';

const DISABLE_TAGS = new Set<DispositionTag>([
  'v2-disabled-broken',
  'v2-disabled-offtopic',
  'v2-disabled-dormant',
  'v2-disabled-ea-lw-dormant',
  'v2-disabled-ea-lw-semi-flag',
  'v2-disabled-authwalled-dead',
]);

interface Disposition {
  id: string;
  tag: DispositionTag;
  // Desired state after apply
  enabled: boolean;
  activityScoreOverride: number | null; // null = leave alone
  reason: string;
}

interface DbRow {
  id: string;
  url: string;
  title: string | null;
  enabled: boolean;
  activity_score: number | null;
  verification_notes: string | null;
  source: string | null;
  source_id: string | null;
}

// ─── Find latest artifacts ────────────────────────────────────

async function findLatest(prefix: string, ext: string): Promise<string> {
  const entries = await fs.readdir(REPORT_DIR);
  const files = entries.filter(n => n.startsWith(prefix) && n.endsWith(ext)).sort();
  if (files.length === 0) throw new Error(`No ${prefix}*${ext} found in ${REPORT_DIR}`);
  return path.join(REPORT_DIR, files[files.length - 1]);
}

// ─── Parsers ───────────────────────────────────────────────────

interface ReverifyExtract {
  acceptUrls: Set<string>;
  brokenIds: Set<string>; // deterministic short-circuit IDs (network/HTTP/parked/empty)
  authWalledIds: Set<string>;
  contentRejectIds: Map<string, { url: string; reasoning: string }>;
}

async function parseReverifyReport(reportPath: string): Promise<ReverifyExtract> {
  const text = await fs.readFile(reportPath, 'utf8');

  // Accepts come from the bottom outcome table only.
  const acceptUrls = new Set<string>();
  const tableRe = /^\| accept [^|]*\| ?(?:communities|events) ?\| ?(https?:\/\/[^| ]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(text)) !== null) acceptUrls.add(m[1].trim());

  // Auth-walled section
  const authWalledIds = new Set<string>();
  {
    const startMatch = text.match(/^## 🔒 Auth-walled rows[^\n]*$/m);
    if (startMatch) {
      const start = startMatch.index! + startMatch[0].length;
      const rest = text.slice(start);
      const endMatch = rest.match(/^## /m);
      const block = endMatch ? rest.slice(0, endMatch.index!) : rest;
      const idRe = /^- \*\*id\*\*: ?`([^`]+)`/gm;
      while ((m = idRe.exec(block)) !== null) authWalledIds.add(m[1]);
    }
  }

  // Content-rejected section: split per-row, identify deterministic short-circuit
  // by templated reasoning prefix.
  const brokenIds = new Set<string>();
  const contentRejectIds = new Map<string, { url: string; reasoning: string }>();
  {
    const startMatch = text.match(/^## ⚠️[^\n]*$/m);
    if (startMatch) {
      const start = startMatch.index! + startMatch[0].length;
      const rest = text.slice(start);
      const endMatch = rest.match(/^## /m);
      const block = endMatch ? rest.slice(0, endMatch.index!) : rest;
      const parts = block.split(/^### /m).slice(1);
      for (const p of parts) {
        const idM = p.match(/^- \*\*id\*\*: ?`([^`]+)`/m);
        const urlM = p.match(/^- \*\*url\*\*: ?(\S+)/m);
        const reasonM = p.match(/^- \*\*stage1 reasoning\*\*: ?(.*)$/m);
        if (!idM) continue;
        const id = idM[1];
        const url = urlM ? urlM[1] : '';
        const reasoning = reasonM ? reasonM[1] : '';
        const r = reasoning.toLowerCase();
        const isBroken =
          r.startsWith('site failed to load') ||
          r.startsWith('site returned http') ||
          r.startsWith('page text matches parked') ||
          /^page has only \d+ visible words/.test(r);
        if (isBroken) brokenIds.add(id);
        contentRejectIds.set(id, { url, reasoning });
      }
    }
  }

  return { acceptUrls, brokenIds, authWalledIds, contentRejectIds };
}

interface EaLwClassification {
  source: 'ea-forum' | 'lesswrong';
  id: string; // forum doc id
  url: string;
  classification: 'active' | 'semi-active' | 'dormant';
}
async function parseEaLw(jsonPath: string): Promise<EaLwClassification[]> {
  const txt = await fs.readFile(jsonPath, 'utf8');
  return JSON.parse(txt) as EaLwClassification[];
}

interface OtherRejectClassification {
  id: string;
  url: string;
  bucket: 'off-topic' | 'dead-or-dormant' | 'policy-keep' | 'borderline';
  recommendedAction: string;
}
async function parseOtherRejects(jsonPath: string): Promise<OtherRejectClassification[]> {
  const txt = await fs.readFile(jsonPath, 'utf8');
  return JSON.parse(txt) as OtherRejectClassification[];
}

interface AuthWalledClassification {
  id: string;
  url: string;
  classification: 'live' | 'dead' | 'unknown';
}
async function parseAuthWalled(jsonPath: string): Promise<AuthWalledClassification[]> {
  const txt = await fs.readFile(jsonPath, 'utf8');
  return JSON.parse(txt) as AuthWalledClassification[];
}

// ─── Main planner ────────────────────────────────────────────

function buildDispositions(args: {
  rev: ReverifyExtract;
  eaLw: EaLwClassification[];
  other: OtherRejectClassification[];
  authW: AuthWalledClassification[];
  dbRows: DbRow[];
}): Disposition[] {
  const { rev, eaLw, other, authW, dbRows } = args;

  // Helper: lookup DB rows by URL (multimap — same URL can appear under
  // multiple resources, e.g., a conference page listed as both event + community).
  const byUrl = new Map<string, DbRow[]>();
  for (const r of dbRows) {
    const arr = byUrl.get(r.url);
    if (arr) arr.push(r);
    else byUrl.set(r.url, [r]);
  }

  // EA/LW lookup by source + source_id (forum doc id == source_id)
  const eaLwByDocId = new Map<string, EaLwClassification>();
  for (const e of eaLw) eaLwByDocId.set(e.id, e);

  const otherById = new Map<string, OtherRejectClassification>();
  for (const o of other) otherById.set(o.id, o);
  const authWById = new Map<string, AuthWalledClassification>();
  for (const a of authW) authWById.set(a.id, a);

  const dispositions: Disposition[] = [];
  const dispositionByDbId = new Map<string, Disposition>();

  function add(d: Disposition) {
    if (dispositionByDbId.has(d.id)) return;
    dispositionByDbId.set(d.id, d);
    dispositions.push(d);
  }

  // 1) Accepts (URL → DB ID, may match multiple rows with same URL)
  for (const url of rev.acceptUrls) {
    const rows = byUrl.get(url);
    if (!rows) continue;
    for (const row of rows) {
      add({
        id: row.id,
        tag: 'v2-accept',
        enabled: true,
        activityScoreOverride: 1.0,
        reason: 'v2 pipeline accepted (boost as mega-great)',
      });
    }
  }

  // 2) Auth-walled liveness classifications (subset of all auth-walled)
  for (const a of authW) {
    if (dispositionByDbId.has(a.id)) continue;
    if (a.classification === 'dead') {
      add({
        id: a.id,
        tag: 'v2-disabled-authwalled-dead',
        enabled: false,
        activityScoreOverride: null,
        reason: 'auth-walled invite/page is expired or invalid',
      });
    } else if (a.classification === 'live') {
      add({
        id: a.id,
        tag: 'v2-authwalled-live',
        enabled: true,
        activityScoreOverride: null,
        reason: 'auth-walled but rendered intact (manual review recommended)',
      });
    } else {
      add({
        id: a.id,
        tag: 'v2-authwalled-unknown',
        enabled: true,
        activityScoreOverride: null,
        reason: 'auth-walled liveness ambiguous (render error / captcha / etc.)',
      });
    }
  }

  // 3) Other rejects
  for (const o of other) {
    if (dispositionByDbId.has(o.id)) continue;
    if (o.bucket === 'off-topic') {
      add({ id: o.id, tag: 'v2-disabled-offtopic', enabled: false, activityScoreOverride: null, reason: 'v2 reject: not AI-safety-focused' });
    } else if (o.bucket === 'dead-or-dormant') {
      add({ id: o.id, tag: 'v2-disabled-dormant', enabled: false, activityScoreOverride: null, reason: 'v2 reject: dormant / no upcoming activity' });
    } else if (o.bucket === 'policy-keep') {
      add({ id: o.id, tag: 'v2-policy-keep', enabled: true, activityScoreOverride: 0.85, reason: 'v2 reject likely false negative — AI-safety-relevant + active' });
    } else {
      add({ id: o.id, tag: 'v2-borderline-flag', enabled: true, activityScoreOverride: null, reason: 'v2 reject borderline — flag for manual review' });
    }
  }

  // 4) Deterministic broken (from reverify content-reject sections)
  for (const id of rev.brokenIds) {
    if (dispositionByDbId.has(id)) continue;
    add({ id, tag: 'v2-disabled-broken', enabled: false, activityScoreOverride: null, reason: 'v2 reject: URL broken (HTTP error / network / parked / empty)' });
  }

  // 5) EA/LW group classifications (look up by source_id)
  for (const r of dbRows) {
    if (dispositionByDbId.has(r.id)) continue;
    if ((r.source === 'ea-forum' || r.source === 'lesswrong') && r.source_id) {
      const cls = eaLwByDocId.get(r.source_id);
      if (!cls) continue;
      if (cls.classification === 'active') {
        add({ id: r.id, tag: 'v2-ea-lw-active', enabled: true, activityScoreOverride: null, reason: 'EA/LW group with verified recent forum activity' });
      } else if (cls.classification === 'semi-active') {
        add({ id: r.id, tag: 'v2-disabled-ea-lw-semi-flag', enabled: false, activityScoreOverride: null, reason: 'EA/LW group with stale activity — disabled, flagged' });
      } else {
        add({ id: r.id, tag: 'v2-disabled-ea-lw-dormant', enabled: false, activityScoreOverride: null, reason: 'EA/LW group with zero forum activity in 24mo' });
      }
    }
  }

  // 6) Remaining content-reject IDs from reverify that didn't fall into other/EA-LW/broken
  for (const [id, info] of rev.contentRejectIds) {
    if (dispositionByDbId.has(id)) continue;
    add({
      id,
      tag: 'v2-disabled-dormant',
      enabled: false,
      activityScoreOverride: null,
      reason: `v2 reject (catch-all): ${info.reasoning.slice(0, 80)}`,
    });
  }

  return dispositions;
}

// ─── Diff computation ────────────────────────────────────────

interface PlannedChange {
  disposition: Disposition;
  current: DbRow;
  changes: { field: string; before: unknown; after: unknown }[];
}

function computeChanges(disp: Disposition, row: DbRow): PlannedChange | null {
  const changes: PlannedChange['changes'] = [];

  if (row.enabled !== disp.enabled) {
    changes.push({ field: 'enabled', before: row.enabled, after: disp.enabled });
  }

  if (disp.activityScoreOverride !== null && row.activity_score !== disp.activityScoreOverride) {
    changes.push({ field: 'activity_score', before: row.activity_score, after: disp.activityScoreOverride });
  }

  if (row.verification_notes !== disp.tag) {
    changes.push({ field: 'verification_notes', before: row.verification_notes, after: disp.tag });
  }

  if (changes.length === 0) return null;
  return { disposition: disp, current: row, changes };
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const filterIdx = argv.indexOf('--filter');
  const filter = filterIdx >= 0 ? argv[filterIdx + 1] : '';

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log('');

  // Load latest artifacts
  const reverifyReport = await findLatest('reverify-', '.md');
  const eaLwJson = await findLatest('ea-lw-activity-', '.json');
  const otherJson = await findLatest('other-rejects-', '.json');
  const authWJson = await findLatest('authwalled-liveness-', '.json');
  console.log(`Sources:
  reverify    : ${reverifyReport}
  ea-lw       : ${eaLwJson}
  other       : ${otherJson}
  authwalled  : ${authWJson}`);
  console.log('');

  const [rev, eaLw, other, authW] = await Promise.all([
    parseReverifyReport(reverifyReport),
    parseEaLw(eaLwJson),
    parseOtherRejects(otherJson),
    parseAuthWalled(authWJson),
  ]);
  console.log(`Parsed:
  v2 accepts        : ${rev.acceptUrls.size}
  v2 deterministic  : ${rev.brokenIds.size}
  v2 auth-walled    : ${rev.authWalledIds.size}
  v2 content-reject : ${rev.contentRejectIds.size}
  ea-lw classified  : ${eaLw.length}
  other classified  : ${other.length}
  authw classified  : ${authW.length}`);
  console.log('');

  // Fetch current DB rows.
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  console.log('Fetching DB rows (paginated)...');
  const dbRows: DbRow[] = [];
  let from = 0;
  const PAGE = 1000;
  // Fetch ALL resources, not just enabled — we may need to re-enable some.
  while (true) {
    const { data, error } = await supa
      .from('resources')
      .select('id, url, title, enabled, activity_score, verification_notes, source, source_id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`DB fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;
    dbRows.push(...(data as DbRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Loaded ${dbRows.length} resources from DB.`);
  console.log('');

  const dispositions = buildDispositions({ rev, eaLw, other, authW, dbRows });
  console.log(`Computed ${dispositions.length} dispositions.`);

  // Tag distribution
  const tagCounts = new Map<DispositionTag, number>();
  for (const d of dispositions) tagCounts.set(d.tag, (tagCounts.get(d.tag) || 0) + 1);
  console.log('\nDisposition breakdown:');
  for (const [tag, n] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const flag = DISABLE_TAGS.has(tag) ? '⚰️' : '✅';
    console.log(`  ${flag} ${tag.padEnd(34)} ${n}`);
  }

  // Compute planned changes
  const dbById = new Map(dbRows.map(r => [r.id, r]));
  const planned: PlannedChange[] = [];
  let missing = 0;
  for (const d of dispositions) {
    const row = dbById.get(d.id);
    if (!row) {
      missing++;
      continue;
    }
    const ch = computeChanges(d, row);
    if (ch) planned.push(ch);
  }

  console.log(`\nPlanned changes: ${planned.length}`);
  if (missing > 0) console.log(`(${missing} dispositions had no matching DB row — skipped)`);

  // Print sample
  const filtered = filter ? planned.filter(p => p.disposition.tag.includes(filter)) : planned;
  const showSample = filtered.slice(0, 25);
  console.log(`\nSample of ${showSample.length} (filtered=${filter || 'none'}):`);
  for (const p of showSample) {
    const fields = p.changes.map(c => `${c.field}: ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}`).join('; ');
    console.log(`  [${p.disposition.tag}] ${p.current.title?.slice(0, 40) || p.current.id} | ${fields}`);
  }

  // Apply
  if (!apply) {
    console.log('\nThis is a DRY-RUN. Re-run with --apply to write to the DB.');
    return;
  }

  console.log('\nApplying...');
  let ok = 0;
  let failed = 0;
  for (const p of planned) {
    const update: Record<string, unknown> = {
      enabled: p.disposition.enabled,
      verification_notes: p.disposition.tag,
      verified_at: new Date().toISOString(),
    };
    if (p.disposition.activityScoreOverride !== null) {
      update.activity_score = p.disposition.activityScoreOverride;
    }
    const { error } = await supa.from('resources').update(update).eq('id', p.disposition.id);
    if (error) {
      failed++;
      if (failed <= 5) console.error(`  ✗ ${p.disposition.id}: ${error.message}`);
    } else {
      ok++;
    }
    if ((ok + failed) % 50 === 0) {
      process.stdout.write(`\r  Applied ${ok + failed}/${planned.length}`);
    }
  }
  console.log(`\nDone. ${ok} ok, ${failed} failed.`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
