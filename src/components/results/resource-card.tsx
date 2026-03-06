"use client";

import { ScoredResource, Variant } from "@/types";
import { trackUrl, formatTime } from "@/lib/utils";
import { OrgLogo } from "@/components/results/org-logo";
import { getOrgDisplayName } from "@/lib/org-logos";

interface ResourceCardProps {
  scored: ScoredResource;
  variant: Variant;
  isPrimary?: boolean;
  customTitle?: string;
  customDescription?: string;
  onClickTrack?: (resourceId: string) => void;
}

export function ResourceCard({
  scored,
  variant,
  isPrimary = false,
  customTitle,
  customDescription,
  onClickTrack,
}: ResourceCardProps) {
  const { resource } = scored;
  const url = trackUrl(resource.url, variant, resource.id);
  const displayName = getOrgDisplayName(resource.source_org, resource.url);

  // Build metadata pieces for the bottom line (date + location only)
  const metaPieces: string[] = [];
  if (resource.deadline_date) {
    metaPieces.push(
      `Deadline: ${new Date(resource.deadline_date).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })}`
    );
  } else if (resource.event_date) {
    metaPieces.push(
      new Date(resource.event_date).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    );
  }
  if (resource.location && resource.location !== "Global" && resource.location !== "Online") {
    metaPieces.push(resource.location);
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onClickTrack?.(resource.id)}
      className={`block w-full rounded-xl border text-left transition-all ${
        isPrimary
          ? "border-accent/40 bg-accent/5 p-5 hover:border-accent/70 hover:bg-accent/10"
          : "border-border bg-card p-4 hover:border-accent/30 hover:bg-card-hover"
      }`}
    >
      {/* Org header: logo + name, time pill right-aligned */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <OrgLogo
          sourceOrg={resource.source_org}
          resourceUrl={resource.url}
          size={isPrimary ? 22 : 18}
        />
        <span className="font-medium">{displayName}</span>
        {resource.category !== "communities" && (
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {formatTime(resource.min_minutes)}
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        className={`mt-2 font-semibold tracking-tight ${
          isPrimary ? "text-xl" : "text-base"
        }`}
      >
        {customTitle || resource.title}
      </h3>

      {/* Description */}
      <p
        className={`mt-1 text-muted-foreground ${
          isPrimary ? "text-base leading-relaxed" : "text-sm"
        }`}
      >
        {customDescription || resource.description}
      </p>

      {/* Date + location footer (only when there's something to show) */}
      {metaPieces.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {metaPieces.map((piece, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-border">·</span>}
              {piece}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}
