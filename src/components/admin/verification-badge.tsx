"use client";

import { classifyVerification, type TierFilter, type VerificationTier } from "@/lib/verification-tiers";

interface VerificationBadgeProps {
  notes: string | null | undefined;
  /** Compact dot-only mode for tight rows. */
  compact?: boolean;
}

export function VerificationBadge({ notes, compact = false }: VerificationBadgeProps) {
  const meta = classifyVerification(notes);

  if (compact) {
    return (
      <span
        title={`${meta.label} — ${meta.description}`}
        className={`inline-block w-2 h-2 rounded-full ${meta.dotClass}`}
      />
    );
  }

  return (
    <span
      title={meta.description}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wide border ${meta.badgeClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </span>
  );
}

interface TierFilterPillsProps {
  value: TierFilter;
  onChange: (next: TierFilter) => void;
  counts?: {
    enabled?: { all: number; on: number; off: number };
    tier?: { all: number; verified: number; flagged: number; disabled: number; unverified: number };
  };
}

const TIER_OPTIONS: Array<{ value: "all" | VerificationTier; label: string; cls: string }> = [
  { value: "all", label: "All Tiers", cls: "" },
  { value: "verified", label: "✓ Verified", cls: "data-[active=true]:bg-emerald-500/10 data-[active=true]:text-emerald-500 data-[active=true]:border-emerald-500/30" },
  { value: "flagged", label: "⚐ Flagged (review)", cls: "data-[active=true]:bg-amber-500/10 data-[active=true]:text-amber-500 data-[active=true]:border-amber-500/30" },
  { value: "disabled", label: "✕ Disabled", cls: "data-[active=true]:bg-red-500/10 data-[active=true]:text-red-500 data-[active=true]:border-red-500/30" },
  { value: "unverified", label: "○ Unverified", cls: "data-[active=true]:bg-muted/30 data-[active=true]:text-foreground data-[active=true]:border-border" },
];

const ENABLED_OPTIONS: Array<{ value: "all" | "on" | "off"; label: string }> = [
  { value: "all", label: "On + Off" },
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

export function TierFilterPills({ value, onChange, counts }: TierFilterPillsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 bg-muted/20 rounded-md p-0.5">
        {ENABLED_OPTIONS.map((o) => {
          const active = value.enabled === o.value;
          const count = counts?.enabled?.[o.value];
          return (
            <button
              key={o.value}
              onClick={() => onChange({ ...value, enabled: o.value })}
              data-active={active}
              className="px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer data-[active=true]:bg-card data-[active=true]:text-foreground data-[active=true]:shadow-sm text-muted-foreground hover:text-foreground"
            >
              {o.label}
              {count !== undefined && <span className="ml-1 text-[10px] font-mono opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1">
        {TIER_OPTIONS.map((o) => {
          const active = value.tier === o.value;
          const count = counts?.tier?.[o.value];
          return (
            <button
              key={o.value}
              onClick={() => onChange({ ...value, tier: o.value })}
              data-active={active}
              className={`px-2.5 py-1 text-xs font-medium rounded-md border border-transparent transition-colors cursor-pointer text-muted-foreground hover:text-foreground ${o.cls}`}
            >
              {o.label}
              {count !== undefined && <span className="ml-1 text-[10px] font-mono opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
