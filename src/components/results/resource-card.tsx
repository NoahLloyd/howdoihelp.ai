"use client";

import { ScoredResource, Variant } from "@/types";
import { trackUrl, formatTime } from "@/lib/utils";
import { OrgLogo } from "@/components/results/org-logo";
import { getOrgDisplayName } from "@/lib/org-logos";
import { Calendar, MapPin, Sparkles } from "lucide-react";

interface ResourceCardProps {
  scored: ScoredResource;
  variant: Variant;
  customTitle?: string;
  customDescription?: string;
  customLocation?: string;
  matchReason?: string;
  formatTimeFn?: (minutes: number) => string;
  dateLocale?: string;
  onClickTrack?: (resourceId: string) => void;
  /** Override utm_campaign on the outbound URL (e.g. "skolegang"). */
  campaignOverride?: string;
}

export function ResourceCard({
  scored,
  variant,
  customTitle,
  customDescription,
  customLocation,
  matchReason,
  formatTimeFn,
  dateLocale,
  onClickTrack,
  campaignOverride,
}: ResourceCardProps) {
  const { resource } = scored;
  const url = trackUrl(resource.url, variant, resource.id, campaignOverride);
  const displayName = getOrgDisplayName(resource.source_org, resource.url);

  // Parse dates
  const eventDate = resource.event_date ? new Date(resource.event_date) : null;
  const deadlineDate = resource.deadline_date ? new Date(resource.deadline_date) : null;
  const displayDate = deadlineDate || eventDate;

  // Location to show
  const showLocation = resource.location && resource.location !== "Global" && resource.location !== "Online";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onClickTrack?.(resource.id)}
      className="group block w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:border-accent/30 hover:bg-card-hover"
    >
      <div className="p-4">
        {/* Org header: logo + name, time pill */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <OrgLogo
            sourceOrg={resource.source_org}
            resourceUrl={resource.url}
            size={18}
          />
          <span className="min-w-0 font-medium">{displayName}</span>
          {resource.category !== "communities" && (
            <span className="shrink-0 whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              {(formatTimeFn || formatTime)(resource.min_minutes)}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="mt-2 text-base font-semibold tracking-tight">
          {customTitle || resource.title}
        </h3>

        {/* Match reason (AI-personalized highlight) */}
        {matchReason && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-accent">
            <Sparkles className="h-3 w-3 shrink-0" />
            {matchReason}
          </p>
        )}

        {/* Description */}
        <p className="mt-1 text-sm text-muted-foreground">
          {customDescription || resource.description}
        </p>

        {/* Date + location footer with icons */}
        {(displayDate || showLocation) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {displayDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3 shrink-0" />
                {deadlineDate ? "Deadline " : ""}
                {displayDate.toLocaleDateString(dateLocale || "en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </span>
            )}
            {showLocation && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {customLocation || resource.location}
              </span>
            )}
          </div>
        )}
      </div>
    </a>
  );
}
