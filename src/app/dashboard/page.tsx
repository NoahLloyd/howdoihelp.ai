"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/components/providers/auth-provider";
import { useEffect, useState } from "react";
import {
  getGuideSettings,
  saveGuideSettings,
  getCreatorPage,
} from "./actions";
import type { GuideData } from "./actions";
import type { CreatorPageData } from "@/types";
import {
  ExternalLink,
  Pencil,
  Eye,
  EyeOff,
  UserCircle,
  Megaphone,
  BookOpen,
  ArrowRight,
  ChevronRight,
} from "lucide-react";

export default function DashboardPage() {
  const { profile } = useAuth();
  const [guide, setGuide] = useState<GuideData | null>(null);
  const [creatorPage, setCreatorPage] = useState<CreatorPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingGuide, setTogglingGuide] = useState(false);

  useEffect(() => {
    Promise.all([
      getGuideSettings().catch(() => null),
      getCreatorPage().catch(() => null),
    ]).then(([g, c]) => {
      setGuide(g);
      setCreatorPage(c);
      setLoading(false);
    });
  }, []);

  const firstName =
    (profile?.display_name || profile?.email?.split("@")[0] || "")
      .split(" ")[0] || "there";

  async function toggleGuideStatus() {
    if (!guide) return;
    setTogglingGuide(true);
    const newStatus = guide.status === "active" ? "paused" : "active";
    try {
      await saveGuideSettings({ ...guide, status: newStatus });
      setGuide({ ...guide, status: newStatus });
    } catch {
      // silent
    }
    setTogglingGuide(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const hasGuide = !!guide;
  const hasCreator = !!creatorPage;
  const nothingSetUp = !hasGuide && !hasCreator;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {nothingSetUp
            ? `Hey ${firstName}.`
            : `Welcome back, ${firstName}.`}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-lg">
          {nothingSetUp
            ? "Here's what you can do with howdoihelp.ai. Set up one or both to get started."
            : "Here's what's happening across your setup."}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {/* ─── Guide Section ──────────────────────────────────── */}
        {hasGuide ? (
          <GuideActiveCard
            guide={guide}
            profile={profile}
            firstName={firstName}
            toggling={togglingGuide}
            onToggle={toggleGuideStatus}
          />
        ) : (
          <SetupCard
            icon={UserCircle}
            title="Become a guide"
            description="Set up a profile so people exploring AI safety can find and book time with you. It takes about two minutes."
            href="/dashboard/guide"
            cta="Set up your profile"
          />
        )}

        {/* ─── Creator Page Section ───────────────────────────── */}
        {hasCreator ? (
          <CreatorActiveCard creatorPage={creatorPage} />
        ) : (
          <SetupCard
            icon={Megaphone}
            title="Create a custom page"
            description="Build a personalized flow for your audience at howdoihelp.ai/your-name. Add custom questions and curate which resources they see."
            href="/dashboard/creator"
            cta="Build your page"
          />
        )}

        {/* ─── Playbook (always visible) ──────────────────────── */}
        <Link
          href="/dashboard/resources"
          className="group rounded-2xl border border-border bg-card p-5 transition-all hover:border-accent/30 hover:bg-card-hover flex items-center gap-4"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              The guide playbook
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tips on having 1:1s that actually change someone&apos;s trajectory.
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted group-hover:text-accent transition-colors shrink-0" />
        </Link>
      </div>
    </motion.div>
  );
}

// ─── Setup Card (not yet configured) ─────────────────────────

function SetupCard({
  icon: Icon,
  title,
  description,
  href,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card-hover text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
          <Link
            href={href}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
          >
            {cta}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Guide Active Card ───────────────────────────────────────

function GuideActiveCard({
  guide,
  profile,
  firstName,
  toggling,
  onToggle,
}: {
  guide: GuideData;
  profile: ReturnType<typeof useAuth>["profile"];
  firstName: string;
  toggling: boolean;
  onToggle: () => void;
}) {
  const isActive = guide.status === "active";
  const isPaused = guide.status === "paused";

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            className="h-12 w-12 rounded-full border border-border object-cover shrink-0"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-card-hover text-sm font-medium text-muted-foreground shrink-0">
            {firstName[0]?.toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <p className="text-base font-semibold text-foreground">
              Guide profile
            </p>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isActive
                  ? "bg-emerald-500/10 text-emerald-600"
                  : isPaused
                    ? "bg-amber-500/10 text-amber-600"
                    : "bg-gray-200 text-gray-500"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isActive
                    ? "bg-emerald-500"
                    : isPaused
                      ? "bg-amber-400"
                      : "bg-gray-400"
                }`}
              />
              {isActive ? "Live" : isPaused ? "Paused" : "Draft"}
            </span>
          </div>

          <p className="mt-0.5 text-sm text-muted-foreground">
            {isActive
              ? "People exploring AI safety can find and book time with you."
              : isPaused
                ? "Your profile is hidden. Toggle back when you're ready."
                : "Saved as a draft. Go live when you're ready."}
          </p>

          {guide.topics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {guide.topics.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent"
                >
                  {t}
                </span>
              ))}
              {guide.topics.length > 4 && (
                <span className="rounded-full bg-card-hover px-2.5 py-0.5 text-xs text-muted-foreground">
                  +{guide.topics.length - 4}
                </span>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/dashboard/guide"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/50 hover:bg-card-hover transition-all"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </Link>
            {(isActive || isPaused) && (
              <button
                onClick={onToggle}
                disabled={toggling}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/50 hover:bg-card-hover transition-all disabled:opacity-50 cursor-pointer"
              >
                {isActive ? (
                  <>
                    <EyeOff className="h-3 w-3" />
                    {toggling ? "Pausing..." : "Pause"}
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" />
                    {toggling ? "Going live..." : "Go live"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Creator Active Card ─────────────────────────────────────

function CreatorActiveCard({
  creatorPage,
}: {
  creatorPage: CreatorPageData;
}) {
  const isActive = creatorPage.status === "active";
  const isPaused = creatorPage.status === "paused";

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Megaphone className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <p className="text-base font-semibold text-foreground">
              Custom page
            </p>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isActive
                  ? "bg-emerald-500/10 text-emerald-600"
                  : isPaused
                    ? "bg-amber-500/10 text-amber-600"
                    : "bg-gray-200 text-gray-500"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isActive
                    ? "bg-emerald-500"
                    : isPaused
                      ? "bg-amber-400"
                      : "bg-gray-400"
                }`}
              />
              {isActive ? "Live" : isPaused ? "Paused" : "Draft"}
            </span>
          </div>

          <p className="mt-0.5 text-sm text-muted-foreground">
            {isActive
              ? `howdoihelp.ai/${creatorPage.slug} is live and accessible.`
              : isPaused
                ? `howdoihelp.ai/${creatorPage.slug} is hidden from visitors.`
                : `howdoihelp.ai/${creatorPage.slug} is saved as a draft.`}
          </p>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/dashboard/creator"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/50 hover:bg-card-hover transition-all"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </Link>
            {isActive && (
              <a
                href={`/${creatorPage.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent/50 hover:bg-card-hover transition-all"
              >
                <ExternalLink className="h-3 w-3" />
                View page
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
