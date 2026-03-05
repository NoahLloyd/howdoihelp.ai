"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createAuthBrowserClient } from "@/lib/supabase-browser";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  useEffect(() => {
    const supabase = createAuthBrowserClient();

    // PKCE flow (Google OAuth): exchange code for session
    const code = searchParams.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        router.replace(error ? "/auth/login?error=auth_failed" : next);
      });
      return;
    }

    // Implicit flow (magic link): the hash fragment contains the tokens
    // but the singleton client was created before this page loaded,
    // so we parse the hash manually and set the session.
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ error }) => {
            router.replace(error ? "/auth/login?error=auth_failed" : next);
          });
        return;
      }
    }

    // Fallback: check if already authenticated
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace(next);
      } else {
        router.replace("/auth/login?error=auth_failed");
      }
    });
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </main>
  );
}
