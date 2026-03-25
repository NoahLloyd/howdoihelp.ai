"use client";

import { useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Instagram, Linkedin } from "lucide-react";
import { posthog } from "@/lib/posthog";

// ─── Data ────────────────────────────────────────────────────

const SOCIAL_LINKS = [
  {
    name: "Instagram",
    href: "https://instagram.com/futurebriefing",
    icon: "instagram" as const,
  },
  {
    name: "TikTok",
    href: "https://tiktok.com/@futurebriefing",
    icon: "tiktok" as const,
  },
  {
    name: "LinkedIn",
    href: "https://linkedin.com/in/caitlinyardley",
    icon: "linkedin" as const,
  },
];

const CTA_BUTTONS = [
  {
    label: "Psst.org",
    href: "https://psst.org",
  },
  {
    label: "Find your representative",
    href: "https://www.commoncause.org/find-your-representative/",
  },
];

const POSTS = [
  {
    src: "/futurebriefing/post-1.jpg",
    href: "https://petergpt.github.io/bullshit-benchmark/viewer/index.v2.html?q=med_cds_01&a=anthropic/claude-opus-4.6@reasoning=none&b=prime-intellect/intellect-3@reasoning=low",
    alt: "People will usually push back if you ask a stupid question. Looks like most AIs won't.",
  },
  {
    src: "/futurebriefing/post-2.jpg",
    href: "https://psst.org/",
    alt: "5 things we can do to push back against OpenAI's Pentagon deal right now",
  },
  {
    src: "/futurebriefing/post-3.jpg",
    href: "https://positive-range-298.notion.site/Understanding-AI-Energy-Use-31125d1b695d80aaad88d86e7dad3cea",
    alt: "Comment RESEARCH to get a list of resources to understand AI energy use.",
  },
  {
    src: "/futurebriefing/post-4.jpg",
    href: "https://arxiv.org/html/2506.12605v1",
    alt: "This Valentine's Day, a growing number of people are looking for love in AI chatbots.",
  },
  {
    src: "/futurebriefing/post-5.jpg",
    href: "https://internationalaisafetyreport.org/publication/international-ai-safety-report-2026",
    alt: "The 2026 International AI Safety Report, led by Yoshua Bengio",
  },
  {
    src: "/futurebriefing/post-6.jpg",
    href: "https://arxiv.org/pdf/2510.22954",
    alt: "One of the top papers from NeurIPS 2025 just proved what we've all been feeling - LLMs are converging",
  },
  {
    src: "/futurebriefing/post-7.jpg",
    href: "https://arxiv.org/html/2511.15304v1",
    alt: "Icaro Lab just discovered that POETRY can jailbreak LLMs, exposing a blindspot",
  },
  {
    src: "/futurebriefing/post-8.jpg",
    href: "https://arxiv.org/abs/2507.13919",
    alt: "Does AI have the power to control political beliefs?",
  },
  {
    src: "/futurebriefing/post-9.jpg",
    href: "https://arxiv.org/pdf/2310.20563",
    alt: "What safety measures could be in place to stop the risk of rogue AI?",
  },
  {
    src: "/futurebriefing/post-10.jpg",
    href: "https://arxiv.org/abs/2502.08640",
    alt: "AI is developing its own preferences and those preferences get stronger",
  },
  {
    src: "/futurebriefing/post-11.jpg",
    href: "https://arxiv.org/abs/2509.22818",
    alt: "Can large language models develop gambling addictions?",
  },
];

// ─── Tracking ────────────────────────────────────────────────

function trackFBEvent(event: string, properties?: Record<string, unknown>) {
  posthog.capture(event, { page: "futurebriefing", ...properties });
}

// ─── Icons ───────────────────────────────────────────────────

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.18 8.18 0 0 0 4.76 1.52V6.84a4.84 4.84 0 0 1-1-.15z" />
    </svg>
  );
}

function SocialIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case "instagram":
      return <Instagram className={className} strokeWidth={1.5} />;
    case "linkedin":
      return <Linkedin className={className} strokeWidth={1.5} />;
    case "tiktok":
      return <TikTokIcon className={className} />;
    default:
      return null;
  }
}

// ─── Component ───────────────────────────────────────────────

export default function FutureBriefingPage() {
  const loadedAt = useRef(Date.now());
  const scrollMilestones = useRef(new Set<number>());

  // Track page load
  useEffect(() => {
    trackFBEvent("fb_page_viewed");

    // Track UTM params if present
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const [key, value] of params) {
      if (key.startsWith("utm_")) utm[key] = value;
    }
    if (Object.keys(utm).length > 0) {
      trackFBEvent("fb_utm_landed", utm);
    }
  }, []);

  // Track scroll depth
  useEffect(() => {
    function onScroll() {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight <= 0) return;
      const pct = Math.round((window.scrollY / scrollHeight) * 100);
      for (const milestone of [25, 50, 75, 100]) {
        if (pct >= milestone && !scrollMilestones.current.has(milestone)) {
          scrollMilestones.current.add(milestone);
          trackFBEvent("fb_scroll_depth", { depth_percent: milestone });
        }
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const trackOutboundClick = useCallback(
    (type: string, label: string, href: string, position?: number) => {
      trackFBEvent("fb_outbound_click", {
        click_type: type,
        label,
        href,
        position,
        time_on_page_ms: Date.now() - loadedAt.current,
      });
    },
    []
  );

  return (
    <main className="min-h-dvh" style={{ background: "#f7f7f8" }}>
      {/* Grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(to right, #eaeaec 1px, transparent 1px), linear-gradient(to bottom, #eaeaec 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="relative mx-auto flex max-w-[680px] flex-col items-center pb-20 pt-12">
        {/* Profile section */}
        <div className="flex w-full flex-col items-center px-5 pb-6">
          <div className="relative h-[96px] w-[96px] overflow-hidden rounded-full ring-2 ring-white/80 shadow-md">
            <Image
              src="/futurebriefing/avatar.jpg"
              alt="futurebriefing"
              fill
              className="object-cover"
              priority
            />
          </div>

          <h1
            className="mt-3.5 text-base font-bold tracking-tight"
            style={{ color: "#1a1a1a" }}
          >
            futurebriefing
          </h1>

          <p
            className="mt-1 max-w-[320px] text-center text-sm leading-snug"
            style={{ color: "#6b7280" }}
          >
            Answering the biggest questions in AI without the hype.
          </p>

          {/* Social Icons */}
          <div className="mt-4 flex items-center gap-3">
            {SOCIAL_LINKS.map((link) => (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackOutboundClick("social", link.name, link.href)
                }
                className="flex h-10 w-10 items-center justify-center rounded-full border bg-white/60 backdrop-blur-sm transition-all hover:bg-white hover:shadow-sm"
                style={{ color: "#374151", borderColor: "#d1d5db" }}
                aria-label={link.name}
              >
                <SocialIcon
                  type={link.icon}
                  className="h-[20px] w-[20px]"
                />
              </a>
            ))}
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="mt-1 flex w-full max-w-[500px] flex-col gap-2.5 px-5">
          {CTA_BUTTONS.map((btn, i) => (
            <a
              key={btn.label}
              href={btn.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackOutboundClick("cta_button", btn.label, btn.href, i)
              }
              className="flex w-full items-center justify-center rounded-full px-6 py-3.5 text-[14px] font-medium text-white shadow-sm transition-all hover:shadow-md hover:brightness-110"
              style={{ backgroundColor: "#6b7e8f" }}
            >
              {btn.label}
            </a>
          ))}
        </div>

        {/* Post Grid */}
        <div className="mt-7 grid w-full grid-cols-3 gap-[3px]">
          {POSTS.map((post, i) => (
            <a
              key={i}
              href={post.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackOutboundClick("post_thumbnail", post.alt, post.href, i)
              }
              className="group relative aspect-square overflow-hidden bg-gray-100"
            >
              <Image
                src={post.src}
                alt={post.alt}
                fill
                className="object-cover transition-transform duration-200 group-hover:scale-105"
                sizes="(max-width: 680px) 33vw, 220px"
              />
              <div className="absolute right-1.5 top-1.5 opacity-80">
                <svg
                  className="h-4 w-4 drop-shadow"
                  viewBox="0 0 24 24"
                  fill="white"
                >
                  <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                  <path d="M5 5v14h14v-7h-2v5H7V7h5V5H5z" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
