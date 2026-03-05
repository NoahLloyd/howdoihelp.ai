"use client";

import { useState } from "react";
import { MapPin, Globe, Calendar } from "lucide-react";
import type { GuideRecommendation } from "@/types";
import { GuideRequestModal } from "./guide-request-modal";

interface GuideCardProps {
  recommendation: GuideRecommendation;
  isPrimary?: boolean;
}

export function GuideCard({ recommendation, isPrimary = false }: GuideCardProps) {
  const [showModal, setShowModal] = useState(false);
  const { guide, description } = recommendation;
  const isDirectBooking = guide.booking_mode === "direct";

  return (
    <>
      <div
        className={`w-full rounded-xl border text-left transition-all ${
          isPrimary
            ? "border-accent/40 bg-accent/5 p-5"
            : "border-border bg-card p-4"
        }`}
      >
        {/* Header */}
        <div className="flex items-start gap-3.5">
          {guide.avatar_url ? (
            <img
              src={guide.avatar_url}
              alt=""
              className="h-12 w-12 rounded-full border border-border object-cover shrink-0"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-card-hover text-sm font-medium text-muted-foreground shrink-0">
              {(guide.display_name || "?")[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-foreground truncate ${isPrimary ? "text-lg" : "text-base"}`}>
              Talk to {guide.display_name || "a guide"}
            </p>
            {guide.headline && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {guide.headline}
              </p>
            )}
          </div>
        </div>

        {/* Personalized description from Claude */}
        <p className={`mt-3 text-muted-foreground leading-relaxed ${isPrimary ? "text-base" : "text-sm"}`}>
          {description}
        </p>

        {/* Topics */}
        {guide.topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {guide.topics.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent"
              >
                {t}
              </span>
            ))}
            {guide.topics.length > 3 && (
              <span className="rounded-full bg-card-hover px-2 py-0.5 text-[11px] font-medium text-muted">
                +{guide.topics.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Meta info */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {guide.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {guide.location}
            </span>
          )}
          {guide.languages.length > 1 && (
            <span className="flex items-center gap-1">
              <Globe className="h-3 w-3" />
              {guide.languages.join(", ")}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            30 min video call
          </span>
        </div>

        {/* CTA */}
        {isDirectBooking ? (
          <a
            href={guide.calendar_link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
          >
            <Calendar className="h-4 w-4" />
            Book a call
          </a>
        ) : (
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer"
          >
            <Calendar className="h-4 w-4" />
            Request a call
          </button>
        )}
      </div>

      {/* Request modal for approval_required mode */}
      {showModal && (
        <GuideRequestModal
          guide={guide}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
