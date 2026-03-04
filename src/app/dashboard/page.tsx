"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/components/providers/auth-provider";
import { useEffect, useState } from "react";
import { getGuideSettings } from "./actions";
import type { GuideData } from "./actions";

export default function DashboardPage() {
  const { profile, signOut } = useAuth();
  const [guide, setGuide] = useState<GuideData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGuideSettings()
      .then(setGuide)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const firstName =
    (profile?.display_name || profile?.email?.split("@")[0] || "")
      .split(" ")[0] || "there";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  // ─── No guide profile yet ────────────────────────────────
  if (!guide) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex flex-col items-center text-center"
      >
        <motion.h1
          className="text-3xl font-semibold tracking-tight sm:text-4xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          Hey {firstName}.
        </motion.h1>

        <motion.p
          className="mt-4 text-lg leading-relaxed text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          Ready to set up your guide profile? It takes about two minutes.
          Once you&apos;re live, we&apos;ll start matching you with people
          who&apos;d benefit from your experience.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-10 w-full"
        >
          <Link
            href="/dashboard/guide"
            className="block w-full rounded-xl bg-accent px-6 py-4 text-center text-base font-medium text-white hover:bg-accent-hover transition-colors"
          >
            Set up your profile
          </Link>
        </motion.div>
      </motion.div>
    );
  }

  // ─── Guide profile exists ────────────────────────────────

  const isActive = guide.status === "active";
  const isPaused = guide.status === "paused";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {isActive
          ? `You're live, ${firstName}.`
          : isPaused
          ? `You're paused, ${firstName}.`
          : `Almost there, ${firstName}.`}
      </h1>

      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        {isActive
          ? "People exploring AI safety can now be matched with you based on your expertise and availability."
          : isPaused
          ? "Your profile is temporarily hidden. Visitors won't see you until you go live again."
          : "Your profile is saved as a draft. Go live when you're ready to start being recommended."}
      </p>

      {/* Preview of how they appear */}
      <div className="mt-10 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-14 w-14 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-card-hover text-base font-medium text-muted-foreground">
              {firstName[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold text-foreground">
                {profile?.display_name || "Your name"}
              </p>
              <span
                className={`inline-flex h-2 w-2 rounded-full ${
                  isActive
                    ? "bg-emerald-500"
                    : isPaused
                    ? "bg-amber-400"
                    : "bg-gray-300"
                }`}
              />
            </div>
            {guide.headline && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {guide.headline}
              </p>
            )}
          </div>
        </div>

        {guide.topics.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {guide.topics.map((t) => (
              <span
                key={t}
                className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 text-xs text-muted">
          {guide.capacity_per_month} meetings/mo &middot;{" "}
          {guide.meeting_duration_minutes} min
          {guide.location ? ` · ${guide.location}` : ""}
          {guide.is_available_in_person ? " · In-person available" : ""}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-col gap-3">
        <Link
          href="/dashboard/guide"
          className="w-full rounded-xl border border-border bg-card px-5 py-4 text-center text-base font-medium text-foreground hover:border-accent/50 hover:bg-card-hover transition-all"
        >
          Edit your profile
        </Link>

        <button
          onClick={signOut}
          className="w-full py-3 text-sm text-muted hover:text-muted-foreground transition-colors cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </motion.div>
  );
}
