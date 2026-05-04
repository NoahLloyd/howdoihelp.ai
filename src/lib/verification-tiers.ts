/**
 * verification-tiers.ts - Shared helpers for the v2 verification scheme.
 *
 * `verification_notes` is a free-form text field, but the v2 evaluator uses
 * a small enumerated set of tags. This module groups those tags into a
 * "tier" so the admin UI (and any other consumer) can reason in consistent
 * categories, regardless of the underlying tag.
 */

export type VerificationTier =
  | 'verified'   // v2 verified active / boosted
  | 'flagged'    // kept enabled but needs human review
  | 'disabled'   // explicitly disabled by v2 (broken / off-topic / dormant / etc.)
  | 'unverified'; // no v2 marker (legacy or fresh from gather)

export interface TierMeta {
  tier: VerificationTier;
  label: string;
  description: string;
  /** Tailwind classes for an inline badge. */
  badgeClass: string;
  /** Bullet color for "indicator dot" UI. */
  dotClass: string;
}

const TAG_TO_META: Record<string, Omit<TierMeta, 'tier'> & { tier: VerificationTier }> = {
  'v2-accept': {
    tier: 'verified',
    label: 'v2 verified',
    description: 'v2 pipeline confirmed: AI-safety-focused and active. Boosted in ranking.',
    badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    dotClass: 'bg-emerald-500',
  },
  'v2-policy-keep': {
    tier: 'verified',
    label: 'policy keep',
    description: 'v2 rejected on strict policy, but text-mining showed AI-safety + active signals. Likely false-negative reject.',
    badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    dotClass: 'bg-emerald-500',
  },
  'v2-ea-lw-active': {
    tier: 'verified',
    label: 'EA/LW active',
    description: 'EA Forum / LessWrong group with confirmed recent forum activity (posts or upcoming events).',
    badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    dotClass: 'bg-emerald-500',
  },

  'v2-authwalled-live': {
    tier: 'flagged',
    label: 'auth-walled (live)',
    description: 'Discord/Insta/LinkedIn etc. that rendered intact. Pipeline cannot see content; manual review recommended.',
    badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    dotClass: 'bg-amber-500',
  },
  'v2-authwalled-unknown': {
    tier: 'flagged',
    label: 'auth-walled (unknown)',
    description: 'Telegram/WhatsApp/etc. that did not render a public preview. Manual review needed to confirm liveness.',
    badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    dotClass: 'bg-amber-500',
  },
  'v2-borderline-flag': {
    tier: 'flagged',
    label: 'borderline',
    description: 'v2 reasoning was inconclusive. Manual review needed.',
    badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    dotClass: 'bg-amber-500',
  },

  'v2-disabled-broken': {
    tier: 'disabled',
    label: 'disabled: broken',
    description: 'URL is dead, parked, returned an HTTP error, or has no usable content.',
    badgeClass: 'bg-red-500/10 text-red-500 border-red-500/30',
    dotClass: 'bg-red-500',
  },
  'v2-disabled-ea-lw-dormant': {
    tier: 'disabled',
    label: 'disabled: EA/LW dormant',
    description: 'EA/LW chapter with zero forum activity in the last 24 months.',
    badgeClass: 'bg-red-500/10 text-red-500 border-red-500/30',
    dotClass: 'bg-red-500',
  },
  'v2-disabled-offtopic': {
    tier: 'disabled',
    label: 'disabled: off-topic',
    description: 'Off-topic for AI safety (animal advocacy, biosecurity, biz AI, generic EA, etc.).',
    badgeClass: 'bg-red-500/10 text-red-500 border-red-500/30',
    dotClass: 'bg-red-500',
  },
  'v2-disabled-dormant': {
    tier: 'disabled',
    label: 'disabled: dormant',
    description: 'No upcoming events, no recent activity, shell page, or stale.',
    badgeClass: 'bg-red-500/10 text-red-500 border-red-500/30',
    dotClass: 'bg-red-500',
  },
  'v2-disabled-ea-lw-semi-flag': {
    tier: 'disabled',
    label: 'disabled: EA/LW semi (flag)',
    description: 'EA/LW chapter with stale activity. Disabled but flagged — re-enable if you have other reason to keep it.',
    badgeClass: 'bg-red-500/10 text-red-500 border-red-500/30',
    dotClass: 'bg-red-500',
  },
  'v2-disabled-authwalled-dead': {
    tier: 'disabled',
    label: 'disabled: auth-walled dead',
    description: 'Auth-walled invite/page explicitly showed expired/invalid/404.',
    badgeClass: 'bg-red-500/10 text-red-500 border-red-500/30',
    dotClass: 'bg-red-500',
  },
};

const UNVERIFIED_META: TierMeta = {
  tier: 'unverified',
  label: 'unverified',
  description: 'No v2 verification marker. Either added manually, came from a legacy gather, or was added since the last v2 reverify.',
  badgeClass: 'bg-muted/30 text-muted-foreground border-border',
  dotClass: 'bg-muted-foreground',
};

export function classifyVerification(notes: string | null | undefined): TierMeta {
  if (!notes || !notes.startsWith('v2-')) return UNVERIFIED_META;
  const meta = TAG_TO_META[notes];
  if (!meta) {
    return {
      tier: 'unverified',
      label: notes.length > 30 ? notes.slice(0, 30) + '…' : notes,
      description: notes,
      badgeClass: 'bg-muted/30 text-muted-foreground border-border',
      dotClass: 'bg-muted-foreground',
    };
  }
  return meta;
}

/** All known v2 tags grouped by tier — useful to render filter pills. */
export const ALL_V2_TAGS = Object.keys(TAG_TO_META) as Array<keyof typeof TAG_TO_META>;

export interface TierFilter {
  enabled: 'all' | 'on' | 'off';
  tier: 'all' | VerificationTier;
  /** A specific v2-* tag, or "all" to ignore. */
  tag: string;
}

export const DEFAULT_TIER_FILTER: TierFilter = {
  enabled: 'all',
  tier: 'all',
  tag: 'all',
};

export function matchesTierFilter(
  resource: { enabled: boolean; verification_notes?: string | null },
  f: TierFilter,
): boolean {
  if (f.enabled === 'on' && !resource.enabled) return false;
  if (f.enabled === 'off' && resource.enabled) return false;
  const meta = classifyVerification(resource.verification_notes);
  if (f.tier !== 'all' && meta.tier !== f.tier) return false;
  if (f.tag !== 'all' && resource.verification_notes !== f.tag) return false;
  return true;
}
