"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import {
  LayoutDashboard,
  UserCircle,
  BookOpen,
  Megaphone,
  Menu,
  X,
  LogOut,
  ExternalLink,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    items: [
      {
        label: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "Guide",
    items: [
      {
        label: "Profile",
        href: "/dashboard/guide",
        icon: UserCircle,
      },
      {
        label: "Playbook",
        href: "/dashboard/resources",
        icon: BookOpen,
      },
    ],
  },
  {
    label: "Creator",
    items: [
      {
        label: "Custom Page",
        href: "/dashboard/creator",
        icon: Megaphone,
      },
    ],
  },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const firstName =
    (profile?.display_name || profile?.email?.split("@")[0] || "")
      .split(" ")[0] || "User";

  return (
    <div className="flex min-h-dvh bg-background">
      {/* ── Sidebar (desktop) ───────────────────────────────── */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-60 flex-col bg-[#13132B] text-white">
        <div className="flex flex-col h-full px-4 py-6 overflow-y-auto">
          {/* Brand */}
          <Link
            href="/"
            className="flex items-center gap-2.5 px-3 text-sm font-semibold text-white/80 hover:text-white transition-colors"
          >
            <img
              src="/icon.png"
              alt=""
              className="h-6 w-6 brightness-0 invert opacity-80"
            />
            howdoihelp.ai
          </Link>

          {/* Primary nav */}
          <nav className="mt-8 flex flex-col gap-5">
            {NAV_SECTIONS.map((section, si) => (
              <div key={si} className="flex flex-col gap-1">
                {section.label && (
                  <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/30">
                    {section.label}
                  </p>
                )}
                {section.items.map((item) => {
                  const isActive =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-white/10 text-white"
                          : "text-white/50 hover:bg-white/5 hover:text-white/80"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Public listing link */}
          <Link
            href="/guides"
            className="flex items-center gap-2 px-3 py-2 text-xs text-white/40 hover:text-white/60 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View public listing
          </Link>

          {/* User section */}
          <div className="mt-2 pt-4 border-t border-white/10">
            <div className="flex items-center gap-3 px-3">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-8 w-8 rounded-full border border-white/10 object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white/60">
                  {firstName[0]?.toUpperCase()}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/80 truncate">
                  {profile?.display_name || profile?.email || "User"}
                </p>
                {profile?.display_name && profile?.email && (
                  <p className="text-[11px] text-white/30 truncate">
                    {profile.email}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={signOut}
              className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/40 hover:bg-white/5 hover:text-white/60 transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ───────────────────────────────────── */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between bg-[#13132B] px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold text-white/80"
        >
          <img
            src="/icon.png"
            alt=""
            className="h-5 w-5 brightness-0 invert opacity-80"
          />
          howdoihelp.ai
        </Link>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 transition-colors cursor-pointer"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* ── Mobile menu overlay ──────────────────────────────── */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-30 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="lg:hidden fixed top-[52px] inset-x-0 z-40 bg-[#13132B] border-t border-white/10 px-4 py-4">
            <nav className="flex flex-col gap-4">
              {NAV_SECTIONS.map((section, si) => (
                <div key={si} className="flex flex-col gap-1">
                  {section.label && (
                    <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/30">
                      {section.label}
                    </p>
                  )}
                  {section.items.map((item) => {
                    const isActive =
                      item.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-white/10 text-white"
                            : "text-white/50 hover:bg-white/5 hover:text-white/80"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-7 w-7 rounded-full border border-white/10 object-cover"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white/60">
                    {firstName[0]?.toUpperCase()}
                  </span>
                )}
                <span className="text-sm text-white/60 truncate">
                  {firstName}
                </span>
              </div>
              <button
                onClick={signOut}
                className="text-xs text-white/40 hover:text-white/60 transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex-1 lg:ml-60">
        <div className="mx-auto w-full max-w-3xl px-6 py-10 pt-[72px] lg:pt-10">
          {children}
        </div>
      </main>
    </div>
  );
}
