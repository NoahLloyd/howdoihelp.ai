import type { Metadata } from "next";
import { BrandedFlow } from "@/components/branded/branded-flow";
import { VIN_BRAND } from "@/components/branded/branded-header";

const title = "Vin Sixsmith | AI safety, unpacked";
const description =
  "Vin Sixsmith's guide to getting involved in AI safety — whether you've got 5 minutes or want to make it your career.";

export const metadata: Metadata = {
  title,
  description,
  // Creator landing page, not canonical site content — keep out of search so
  // it doesn't compete with the main site.
  robots: { index: false, follow: true },
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function VinPage() {
  return <BrandedFlow brand={VIN_BRAND} />;
}
