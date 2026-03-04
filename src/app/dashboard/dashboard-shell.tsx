"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();

  const isGuide = pathname.startsWith("/dashboard/guide");

  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto w-full max-w-lg px-6 py-10">
        {/* Minimal top bar — feels like part of the site, not a separate app */}
        <div className="flex items-center justify-between mb-10">
          <Link
            href="/"
            className="text-sm text-muted hover:text-muted-foreground transition-colors"
          >
            howdoihelp.ai
          </Link>

          <div className="flex items-center gap-3">
            {!isGuide && (
              <Link
                href="/dashboard/guide"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Guide settings
              </Link>
            )}
            {isGuide && (
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
            )}

            <button
              onClick={signOut}
              className="flex items-center gap-2 text-sm text-muted hover:text-muted-foreground transition-colors cursor-pointer"
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-6 w-6 rounded-full"
                />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-card-hover text-[10px] font-medium text-muted-foreground">
                  {(
                    profile?.display_name ||
                    profile?.email ||
                    "?"
                  )[0]?.toUpperCase()}
                </span>
              )}
            </button>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
