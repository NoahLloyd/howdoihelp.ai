import type { Metadata } from "next";
import { BrandedFlow } from "@/components/branded/branded-flow";
import { JOSH_BRAND } from "@/components/branded/branded-header";

const title = "Josh Thor | Risks from AI, and what to do about them";
const description =
  "Learn more about risks from AI and take action — Josh Thor's guide to getting involved.";

export const metadata: Metadata = {
  title,
  description,
  // Creator landing page, not canonical site content — keep out of search so
  // it doesn't compete with the main site.
  robots: { index: false, follow: true },
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function JoshPage() {
  return <BrandedFlow brand={JOSH_BRAND} />;
}
