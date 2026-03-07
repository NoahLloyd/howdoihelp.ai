"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const fade = (delay: number = 0) => ({
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: 0.5, delay, ease: "easeOut" as const },
});

export function AboutContent() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        {/* Back */}
        <motion.div {...fade()}>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Back
          </Link>
        </motion.div>

        {/* ── What this is ─────────────────────────────────── */}
        <motion.h1
          {...fade(0.06)}
          className="mt-14 text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          howdoihelp.ai
        </motion.h1>

        <motion.div {...fade(0.12)} className="mt-6 space-y-4">
          <p className="text-[17px] leading-relaxed text-muted-foreground">
            A lot of people now believe AI development carries serious risks,
            but most have no idea what to do about it. There are hundreds of
            communities, events, programs, and organizations working on AI
            safety, but it is hard to find what makes sense for you.
          </p>
          <p className="text-[17px] leading-relaxed text-muted-foreground">
            We strive to make it as easy as possible to find the best way to
            get started, by collecting those resources and matching them to
            you.
          </p>
        </motion.div>

        {/* ── Browse ───────────────────────────────────────── */}
        <motion.div {...fade()} className="mt-20">
          <h2 className="text-xl font-semibold tracking-tight">
            What you can find here
          </h2>

          <div className="mt-6 flex flex-col gap-2">
            <PageLink
              href="/communities"
              title="Communities"
              description="Groups, chapters, and meetups by location and topic"
            />
            <PageLink
              href="/events"
              title="Events"
              description="Conferences, workshops, and gatherings"
            />
            <PageLink
              href="/programs"
              title="Programs"
              description="Courses, fellowships, grants, and training"
            />
            <PageLink
              href="/letters"
              title="Letters & Petitions"
              description="Open letters and pledges you can sign"
            />
          </div>

        </motion.div>

        {/* ── Guides ───────────────────────────────────────── */}
        <motion.div {...fade()} className="mt-20">
          <h2 className="text-xl font-semibold tracking-tight">
            Talk to someone
          </h2>

          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Guides are people already working in AI safety who volunteer
            30-minute video calls to help others navigate the field. When you
            use our tool, we match you with a guide who fits your background
            and goals, so both sides get the most out of the conversation.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <PageLink
              href="/auth/login"
              title="Become a guide"
              description="Sign up to take calls and help people entering the field"
            />
          </div>
        </motion.div>

        {/* ── Build ────────────────────────────────────────── */}
        <motion.div {...fade()} className="mt-20">
          <h2 className="text-xl font-semibold tracking-tight">
            Build on this
          </h2>

          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            The data and the platform are open for others to use.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <PageLink
              href="/auth/login"
              title="Creator pages"
              description="Build a custom landing page for your audience at howdoihelp.ai/your-name with your own questions, resource selections, and flow"
            />
            <PageLink
              href="/developers"
              title="Developer API"
              description="Free, public access to all communities and events data. No authentication needed. JSON and CSV."
            />
          </div>
        </motion.div>

        {/* ── Footer ───────────────────────────────────────── */}
        <motion.div {...fade()} className="mt-24">
          <div className="h-px bg-border" />

          <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
            This project is{" "}
            <a
              href="https://github.com/NoahLloyd/help-ai-safety"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:text-accent transition-colors"
            >
              open source
            </a>{" "}
            under the MIT license. Built by{" "}
            <a
              href="https://noahlr.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:text-accent transition-colors"
            >
              Noah Lloyd Robson
            </a>.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

/* ── Page link row ──────────────────────────────────────────── */

function PageLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-accent/30"
    >
      <div>
        <span className="block text-sm font-medium text-foreground group-hover:text-accent transition-colors">
          {title}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {description}
        </span>
      </div>
      <span className="shrink-0 text-muted/30 group-hover:text-accent transition-colors ml-3">
        &rarr;
      </span>
    </Link>
  );
}
