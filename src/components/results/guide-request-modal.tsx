"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface GuideInfo {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  headline: string | null;
}

interface GuideRequestModalProps {
  guide: GuideInfo;
  onClose: () => void;
}

export function GuideRequestModal({ guide, onClose }: GuideRequestModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileLink, setProfileLink] = useState("");
  const [message, setMessage] = useState("");
  const [showMessage, setShowMessage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guideName = guide.display_name || "this guide";
  const firstName = guideName.split(" ")[0];

  // Close on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/guide-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guideId: guide.id,
          name: name.trim(),
          email: email.trim(),
          profileLink: profileLink.trim(),
          message: message.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send request");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>

          {submitted ? (
            /* Success state */
            <div className="py-8 text-center">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-accent/10 flex items-center justify-center mb-5">
                <svg className="h-7 w-7 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                Request sent!
              </h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                {firstName} will review your request and you&apos;ll get an email with their booking link if they accept.
              </p>
              <button
                onClick={onClose}
                className="mt-6 rounded-xl bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          ) : (
            /* Form */
            <>
              {/* Guide header */}
              <div className="flex items-center gap-3 mb-6">
                {guide.avatar_url ? (
                  <img
                    src={guide.avatar_url}
                    alt=""
                    className="h-10 w-10 rounded-full border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card-hover text-sm font-medium text-muted-foreground">
                    {guideName[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Request a call with {guideName}
                  </p>
                  {guide.headline && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {guide.headline}
                    </p>
                  )}
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label htmlFor="req-name" className="text-sm font-medium text-foreground">
                    Your name
                  </label>
                  <input
                    id="req-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                    className="mt-1.5 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                  />
                </div>

                <div>
                  <label htmlFor="req-email" className="text-sm font-medium text-foreground">
                    Your email
                  </label>
                  <input
                    id="req-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="mt-1.5 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                  />
                </div>

                <div>
                  <label htmlFor="req-profile" className="text-sm font-medium text-foreground">
                    Link to a public profile
                  </label>
                  <input
                    id="req-profile"
                    type="url"
                    value={profileLink}
                    onChange={(e) => setProfileLink(e.target.value)}
                    required
                    placeholder="LinkedIn, personal website, GitHub, etc."
                    className="mt-1.5 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                  />
                </div>

                {showMessage ? (
                  <div>
                    <label htmlFor="req-message" className="text-sm font-medium text-foreground">
                      Message for {firstName}
                    </label>
                    <textarea
                      id="req-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      autoFocus
                      placeholder={`e.g. I'm a software engineer exploring AI safety and would love your perspective on transitioning into the field`}
                      className="mt-1.5 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20 resize-none"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowMessage(true)}
                    className="text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer text-left"
                  >
                    + Add a message
                  </button>
                )}

                {error && (
                  <p className="text-sm text-rose-500">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting || !name.trim() || !email.trim() || !profileLink.trim()}
                  className="w-full rounded-xl bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Sending..." : "Send request"}
                </button>

                <p className="text-center text-xs text-muted">
                  {firstName} will review your request and decide whether to share their booking link with you.
                </p>
              </form>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
