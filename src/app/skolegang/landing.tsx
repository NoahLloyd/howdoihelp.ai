"use client";

import { useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { posthog } from "@/lib/posthog";
import { OrgLogo } from "@/components/results/org-logo";
import { getOrgDisplayName } from "@/lib/org-logos";
import { withUtm } from "@/lib/utils";

const UTM_CAMPAIGN = "skolegang";

/** Danish-friendly time formatter (no "hour" word) */
function formatTimeDa(minutes: number): string {
  if (minutes <= 2) return "2 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 2) return "~1 time";
  if (hours <= 40) return `${Math.round(hours)} timer`;
  const weeks = Math.round(hours / 20);
  if (weeks <= 8) return `${weeks} uger`;
  const months = Math.round(hours / 160);
  return months <= 1 ? "~1 måned" : `${months} måneder`;
}

// ─── Tracking ────────────────────────────────────────────────

function track(event: string, properties?: Record<string, unknown>) {
  posthog.capture(event, { page: "skolegang", source: "skolegang.dk", ...properties });
}

// ─── Static action cards ─────────────────────────────────────

const STATIC_ACTIONS = [
  {
    id: "bluedot",
    title: "Bliv klog på hvor AI er på vej hen",
    description: "Gratis onlinekursus, der forklarer hvad der sker med AI, og hvad vi kan gøre. Ingen teknisk baggrund nødvendig. Næste hold er åbent for tilmelding.",
    href: "https://bluedot.org/courses/agi-strategy",
    org: "BlueDot Impact",
    minutes: 1500,
  },
  {
    id: "ai2027-video",
    title: "Vi er ikke klar til superintelligens",
    description: "Se hvordan AI kan udvikle sig de næste par år, bygget på forskeres forudsigelser.",
    href: "https://www.youtube.com/watch?v=5KVDDfAkRgc",
    org: "AI in Context",
    minutes: 30,
  },
  {
    id: "jobs",
    title: "Udforsk AI safety-jobs",
    description: "Et felt i hurtig vækst med stillinger inden for forskning, policy, kommunikation og meget mere.",
    href: "https://jobs.80000hours.org/?refinementList%5Btags_area%5D%5B0%5D=AI%20safety%20%26%20policy",
    org: "80,000 Hours",
    minutes: 10,
  },
  {
    id: "80k",
    title: "Læs 80,000 Hours om AI safety",
    description: "Det store billede: hvorfor det er et af de vigtigste problemer i verden, og hvad du kan gøre.",
    href: "https://80000hours.org/problem-profiles/artificial-intelligence/",
    org: "80,000 Hours",
    minutes: 30,
  },
];

// ─── Main Component ──────────────────────────────────────────

export function SkolegangLanding() {
  const loadedAt = useRef(0);
  const scrollMilestones = useRef(new Set<number>());

  // Page view + UTM tracking on mount
  useEffect(() => {
    loadedAt.current = Date.now();
    track("skolegang_page_viewed");
    posthog.register({ skolegang_visitor: true });

    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const [key, value] of params) {
      if (key.startsWith("utm_")) utm[key] = value;
    }
    if (Object.keys(utm).length > 0) {
      track("skolegang_utm_landed", utm);
    }
  }, []);

  // Scroll depth tracking
  useEffect(() => {
    function onScroll() {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight <= 0) return;
      const pct = Math.round((window.scrollY / scrollHeight) * 100);
      for (const milestone of [25, 50, 75, 100]) {
        if (pct >= milestone && !scrollMilestones.current.has(milestone)) {
          scrollMilestones.current.add(milestone);
          track("skolegang_scroll_depth", { depth_percent: milestone });
        }
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleStaticClick = useCallback(
    (actionId: string, href: string) => {
      track("skolegang_action_clicked", {
        action_id: actionId,
        href,
        time_on_page_ms: Date.now() - loadedAt.current,
      });
    },
    []
  );

  return (
    <main className="min-h-dvh px-6 py-12">
      <div className="mx-auto w-full max-w-lg">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            AI ændrer alt.
            <br />
            Her er hvad du kan gøre.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            AI-udviklingen accelererer, og eksperterne er bekymrede. Du behøver
            ikke en teknisk baggrund for at gøre en forskel. Der er konkrete
            ting du kan gøre allerede i dag.
          </p>
        </motion.div>

        {/* Cards */}
        <div className="mt-8 flex flex-col gap-3">
          {STATIC_ACTIONS.map((action, i) => (
            <motion.div
              key={action.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
            >
              <StaticActionCard action={action} onClick={handleStaticClick} />
            </motion.div>
          ))}
        </div>

        <div className="pb-8" />
      </div>
    </main>
  );
}

// ─── Static Action Card (matches ResourceCard style) ─────────

function StaticActionCard({
  action,
  onClick,
}: {
  action: (typeof STATIC_ACTIONS)[number];
  onClick: (id: string, href: string) => void;
}) {
  const displayName = getOrgDisplayName(action.org);
  const href = withUtm(action.href, UTM_CAMPAIGN, action.id);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onClick(action.id, href)}
      className="group block w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:border-accent/30 hover:bg-card-hover"
    >
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <OrgLogo sourceOrg={action.org} resourceUrl={action.href} size={18} />
          <span className="font-medium">{displayName}</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {formatTimeDa(action.minutes)}
          </span>
        </div>
        <h3 className="mt-2 text-base font-semibold tracking-tight">
          {action.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {action.description}
        </p>
      </div>
    </a>
  );
}
