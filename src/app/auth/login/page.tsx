"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createAuthBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const searchParams = useSearchParams();
  const authError = searchParams.get("error");

  const supabase = createAuthBrowserClient();
  const next = searchParams.get("next") ?? "/dashboard";

  async function handleGoogleLogin() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      },
    });
    if (error) setError(error.message);
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      },
    });

    setLoading(false);
    if (error) setError(error.message);
    else setMagicLinkSent(true);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-lg">
        <AnimatePresence mode="wait">
          {magicLinkSent ? (
            <motion.div
              key="sent"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex flex-col items-center text-center"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center"
              >
                <svg
                  className="h-8 w-8 text-accent"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                  />
                </svg>
              </motion.div>

              <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
                Check your email
              </h1>

              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                We sent a sign-in link to{" "}
                <span className="font-medium text-foreground">{email}</span>
              </p>

              <button
                onClick={() => {
                  setMagicLinkSent(false);
                  setEmail("");
                }}
                className="mt-8 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Use a different email
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="flex flex-col items-center text-center"
            >
              <motion.h1
                className="text-4xl font-semibold tracking-tight sm:text-5xl"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
              >
                People need your help.
              </motion.h1>

              <motion.p
                className="mt-4 text-lg leading-relaxed text-muted-foreground sm:text-xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.6 }}
              >
                Sign in to become a guide. We&apos;ll connect you with people
                exploring AI safety who could use your experience.
              </motion.p>

              <motion.div
                className="mt-10 w-full max-w-xs"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                {(error || authError) && (
                  <motion.p
                    className="mb-4 text-sm text-rose-500"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {error || "Something went wrong. Please try again."}
                  </motion.p>
                )}

                <button
                  onClick={handleGoogleLogin}
                  className="w-full rounded-xl border border-border bg-card px-5 py-4 text-base font-medium text-foreground transition-all hover:border-accent/50 hover:bg-card-hover cursor-pointer flex items-center justify-center gap-3"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </button>

                <AnimatePresence mode="wait">
                  {!showEmail ? (
                    <motion.button
                      key="toggle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowEmail(true)}
                      className="mt-4 w-full py-3 text-sm text-muted hover:text-muted-foreground transition-colors cursor-pointer"
                    >
                      or use email
                    </motion.button>
                  ) : (
                    <motion.form
                      key="email"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      onSubmit={handleMagicLink}
                      className="mt-4 flex gap-2"
                    >
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@email.com"
                        autoComplete="email"
                        autoFocus
                        className="flex-1 rounded-xl border border-border bg-card px-4 py-3.5 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                      />
                      <button
                        type="submit"
                        disabled={loading || !email.trim()}
                        className="rounded-xl bg-accent px-5 py-3.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-40 cursor-pointer shrink-0"
                      >
                        {loading ? (
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          "Go"
                        )}
                      </button>
                    </motion.form>
                  )}
                </AnimatePresence>
              </motion.div>

              <motion.a
                href="/"
                className="mt-16 text-sm text-muted hover:text-muted-foreground transition-colors"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                howdoihelp.ai
              </motion.a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
