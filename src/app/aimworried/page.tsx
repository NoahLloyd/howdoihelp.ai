import type { Metadata } from "next";
import { BrandedFlow } from "@/components/branded/branded-flow";
import { AIMWORRIED_BRAND } from "@/components/branded/branded-header";

const title = "AI'M worried | Vin Sixsmith";
const description =
  "AI'M worried — Vin Sixsmith's guide to getting involved in AI safety, whether you've got 5 minutes or want to make it your career.";

export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: true },
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function AimWorriedPage() {
  return <BrandedFlow brand={AIMWORRIED_BRAND} />;
}
