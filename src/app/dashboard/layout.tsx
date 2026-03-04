import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUser, createAuthClient } from "@/lib/supabase-server";
import { AuthProvider } from "@/components/providers/auth-provider";
import { DashboardShell } from "./dashboard-shell";

export const metadata: Metadata = {
  title: "Dashboard — howdoihelp.ai",
  description: "Manage your profile and guide settings",
  robots: "noindex, nofollow",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Fetch profile for the auth provider
  const supabase = await createAuthClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <AuthProvider initialProfile={profile}>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
