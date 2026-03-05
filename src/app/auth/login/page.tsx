"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createAuthBrowserClient } from "@/lib/supabase-browser";
import { ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();
  const authError = searchParams.get("error");

  const supabase = createAuthBrowserClient();
  const next = searchParams.get("next") ?? "/dashboard";

  // Redirect if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace(next);
      } else {
        setCheckingAuth(false);
      }
    });
  }, []);

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

    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          next,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else {
        setMagicLinkSent(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }

    setLoading(false);
  }

  if (checkingAuth) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh">
      {/* ── Left panel: Brand ─────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] shrink-0 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a2e23] via-[#0d3d2e] to-[#0a1f18]" />

        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-[#0D9373]/20 blur-[120px]" />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <a
            href="/"
            className="flex items-center gap-2.5 text-sm font-medium text-white/70 hover:text-white/90 transition-colors"
          >
            <img
              src="/icon.png"
              alt=""
              className="h-7 w-7 brightness-0 invert opacity-70"
            />
            howdoihelp.ai
          </a>

          <div>
            <motion.h1
              className="text-4xl font-semibold tracking-tight leading-[1.15] xl:text-5xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            >
              People need
              <br />
              your help.
            </motion.h1>

            <motion.p
              className="mt-5 text-base leading-relaxed text-white/60 max-w-sm xl:text-lg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.7 }}
            >
              Sign in to become a guide. We&apos;ll connect you with people
              exploring AI safety who could use your experience.
            </motion.p>
          </div>

          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            <div className="flex -space-x-2">
              {["bg-emerald-400", "bg-teal-400", "bg-cyan-400"].map(
                (bg, i) => (
                  <div
                    key={i}
                    className={`h-8 w-8 rounded-full ${bg} border-2 border-[#0a2e23] flex items-center justify-center text-[10px] font-bold text-white/90`}
                  >
                    {["A", "K", "M"][i]}
                  </div>
                )
              )}
            </div>
            <p className="text-xs text-white/40">
              Join guides already helping others
            </p>
          </motion.div>
        </div>
      </div>

      {/* ── Right panel: Auth form ────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-background">
        {/* Mobile-only compact brand header */}
        <div className="lg:hidden w-full max-w-sm mb-10">
          <a
            href="/"
            className="flex items-center gap-2 text-sm text-muted hover:text-muted-foreground transition-colors"
          >
            <img src="/icon.png" alt="" className="h-6 w-6" />
            howdoihelp.ai
          </a>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            People need your help.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Sign in to become a guide. We&apos;ll connect you with people
            exploring AI safety who could use your experience.
          </p>
        </div>

        <div className="w-full max-w-sm">
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
                  className="h-14 w-14 rounded-2xl bg-accent/10 flex items-center justify-center"
                >
                  <svg
                    className="h-7 w-7 text-accent"
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

                <h2 className="mt-6 text-2xl font-semibold tracking-tight">
                  Check your email
                </h2>

                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
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
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                <motion.h2
                  className="hidden lg:block text-2xl font-semibold tracking-tight"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.4 }}
                >
                  Sign in
                </motion.h2>

                <motion.p
                  className="hidden lg:block mt-2 text-sm text-muted-foreground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                >
                  Get started with Google or your email address.
                </motion.p>

                <motion.div
                  className="lg:mt-8 flex flex-col gap-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                >
                  {(error || authError) && (
                    <motion.p
                      className="text-sm text-rose-500"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      {error || "Something went wrong. Please try again."}
                    </motion.p>
                  )}

                  {/* Google */}
                  <button
                    onClick={handleGoogleLogin}
                    className="w-full rounded-xl border border-border bg-card px-5 py-3.5 text-sm font-medium text-foreground transition-all hover:border-accent/50 hover:bg-card-hover cursor-pointer flex items-center justify-center gap-3"
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

                  {/* Divider */}
                  <div className="relative flex items-center gap-4 py-1">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted shrink-0">or</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  {/* Email */}
                  <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@email.com"
                      autoComplete="email"
                      className="w-full rounded-xl border border-border bg-card px-4 py-3.5 text-sm outline-none transition-all placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                    />
                    <button
                      type="submit"
                      disabled={loading || !email.trim()}
                      className="group w-full rounded-xl bg-accent px-5 py-3.5 text-sm font-medium text-white hover:bg-accent-hover transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <>
                          Continue with email
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </>
                      )}
                    </button>
                  </form>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
