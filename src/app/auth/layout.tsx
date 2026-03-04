import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in — howdoihelp.ai",
  description: "Sign in to manage your guide profile",
  robots: "noindex, nofollow",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
