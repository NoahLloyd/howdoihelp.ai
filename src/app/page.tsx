"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5">
      <motion.div
        className="mb-10 text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" as const }}
      >
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Help make AI go well
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
          There are real things you can do. Pick how you&apos;d like to start.
        </p>
      </motion.div>

      <div className="flex w-full max-w-3xl flex-col gap-3 sm:grid sm:grid-cols-3 sm:gap-4">
        {/* Browse */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4, ease: "easeOut" as const }}
        >
          <Link
            href="/browse"
            className="group flex items-center gap-4 rounded-2xl border-2 border-border bg-card px-5 py-4 transition-all hover:border-accent hover:shadow-md active:scale-[0.98] sm:flex-col sm:items-center sm:px-6 sm:py-10 sm:text-center"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 transition-colors group-hover:bg-emerald-500/20 sm:h-14 sm:w-14 sm:rounded-2xl">
              <svg className="h-6 w-6 sm:h-7 sm:w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </span>
            <div className="sm:mt-4">
              <span className="block text-lg font-semibold sm:text-xl">Browse</span>
              <span className="block text-sm leading-snug text-muted-foreground">
                See everything and filter by what fits
              </span>
            </div>
          </Link>
        </motion.div>

        {/* Quick questions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4, ease: "easeOut" as const }}
        >
          <Link
            href="/questions"
            className="group flex items-center gap-4 rounded-2xl border-2 border-border bg-card px-5 py-4 transition-all hover:border-blue-500 hover:shadow-md active:scale-[0.98] sm:flex-col sm:items-center sm:px-6 sm:py-10 sm:text-center"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 transition-colors group-hover:bg-blue-500/20 sm:h-14 sm:w-14 sm:rounded-2xl">
              <svg className="h-6 w-6 sm:h-7 sm:w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
              </svg>
            </span>
            <div className="sm:mt-4">
              <span className="block text-lg font-semibold sm:text-xl">Quick questions</span>
              <span className="block text-sm leading-snug text-muted-foreground">
                A few taps to narrow things down
              </span>
            </div>
          </Link>
        </motion.div>

        {/* Tell us about you */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4, ease: "easeOut" as const }}
        >
          <Link
            href="/profile"
            className="group flex items-center gap-4 rounded-2xl border-2 border-border bg-card px-5 py-4 transition-all hover:border-purple-500 hover:shadow-md active:scale-[0.98] sm:flex-col sm:items-center sm:px-6 sm:py-10 sm:text-center"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 transition-colors group-hover:bg-purple-500/20 sm:h-14 sm:w-14 sm:rounded-2xl">
              <svg className="h-6 w-6 sm:h-7 sm:w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </span>
            <div className="sm:mt-4">
              <span className="block text-lg font-semibold sm:text-xl">Tell us about you</span>
              <span className="block text-sm leading-snug text-muted-foreground">
                Get personalized recommendations
              </span>
            </div>
          </Link>
        </motion.div>
      </div>
    </main>
  );
}
