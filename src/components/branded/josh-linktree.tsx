"use client";

import Image from "next/image";
import { motion } from "framer-motion";

type JoshLinktreeProps = {
  /** Fired when the in-funnel CTA is tapped — should advance the BrandedFlow into the recommendation funnel. */
  onTakeAction: () => void;
  /** Optional event hook so the parent can capture analytics for outbound link clicks. */
  onLinkClick?: (linkId: string, href: string) => void;
};

const PRIMARY_LINKS: Array<{
  id: string;
  title: string;
  href?: string;
  external?: boolean;
}> = [
  {
    id: "best_intro",
    title: "Want to learn more? This is the best intro",
    href: "https://youtu.be/5KVDDfAkRgc",
    external: true,
  },
  {
    id: "take_action",
    title: "Want to do something about AI? Go here",
  },
  {
    id: "ban_superintelligence",
    title: "Ban Superintelligence",
    href: "https://campaign.controlai.com/take-action",
    external: true,
  },
];

const SOCIAL_LINKS: Array<{
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}> = [
  {
    id: "instagram",
    label: "Instagram",
    href: "https://instagram.com/joshthor_",
    icon: <InstagramIcon />,
  },
  {
    id: "tiktok",
    label: "TikTok",
    href: "https://tiktok.com/@joshthor_",
    icon: <TikTokIcon />,
  },
  {
    id: "youtube",
    label: "YouTube",
    href: "https://www.youtube.com/@josh_thor",
    icon: <YouTubeIcon />,
  },
  {
    id: "twitter",
    label: "X",
    href: "https://x.com/joshthor9",
    icon: <XIcon />,
  },
  {
    id: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/people/Josh-Thor/61580771446720/",
    icon: <FacebookIcon />,
  },
];

const BG = "#ffeee1";
const BUTTON_BORDER = "#1f1a16";
const BUTTON_HOVER_BG = "#ccbeb4";
const TEXT = "#1f1a16";

export function JoshLinktree({ onTakeAction, onLinkClick }: JoshLinktreeProps) {
  function handleLink(
    e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>,
    link: { id: string; href?: string }
  ) {
    onLinkClick?.(link.id, link.href ?? "internal");
    if (!link.href) {
      e.preventDefault();
      onTakeAction();
    }
  }

  return (
    <main
      className="min-h-dvh w-full"
      style={{ background: BG, color: TEXT }}
    >
      <div className="mx-auto flex w-full max-w-md flex-col items-center px-5 pt-12 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col items-center text-center"
        >
          <div
            className="relative h-24 w-24 overflow-hidden rounded-full"
            style={{ boxShadow: "0 8px 28px rgba(31,26,22,0.18)" }}
          >
            <Image
              src="/josh/avatar.jpg"
              alt="Josh Thor"
              fill
              sizes="96px"
              className="object-cover"
              priority
            />
          </div>
          <p
            className="mt-4 text-[17px] font-bold tracking-tight"
            style={{ fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)" }}
          >
            @joshthor_
          </p>
          <p
            className="mt-2 max-w-xs text-[13px] leading-snug"
            style={{
              fontFamily:
                "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
              color: TEXT,
            }}
          >
            Learn more about risks from AI and take action!
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="mt-8 flex w-full flex-col gap-3"
        >
          {PRIMARY_LINKS.map((link) =>
            link.href ? (
              <a
                key={link.id}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => handleLink(e, link)}
                className="group block w-full rounded-full border-2 bg-transparent px-5 py-4 text-center text-[14px] font-semibold transition-colors"
                style={{
                  borderColor: BUTTON_BORDER,
                  color: TEXT,
                  fontFamily:
                    "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = BUTTON_HOVER_BG;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {link.title}
              </a>
            ) : (
              <button
                key={link.id}
                type="button"
                onClick={(e) => handleLink(e, link)}
                className="block w-full rounded-full border-2 bg-transparent px-5 py-4 text-center text-[14px] font-semibold transition-colors"
                style={{
                  borderColor: BUTTON_BORDER,
                  color: TEXT,
                  fontFamily:
                    "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = BUTTON_HOVER_BG;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {link.title}
              </button>
            )
          )}
        </motion.div>

        <motion.nav
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          aria-label="Josh's social media"
          className="mt-10 flex items-center gap-5"
        >
          {SOCIAL_LINKS.map((social) => (
            <a
              key={social.id}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={social.label}
              onClick={() => onLinkClick?.(`social_${social.id}`, social.href)}
              className="opacity-80 transition-opacity hover:opacity-100"
              style={{ color: TEXT }}
            >
              {social.icon}
            </a>
          ))}
        </motion.nav>
      </div>
    </main>
  );
}

function InstagramIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.5a8.16 8.16 0 0 0 4.77 1.52V6.59a4.85 4.85 0 0 1-1.84-.13z" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.377.505 9.377.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}
