import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "magiclink" | "email";
  const next = searchParams.get("next") ?? "/dashboard";

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/auth/login?error=auth_failed", origin));
  }

  const supabase = await createAuthClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error) {
    console.error("[verify] OTP verification failed:", error.message);
    return NextResponse.redirect(new URL("/auth/login?error=auth_failed", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
