import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Futurebriefing",
  description: "Answering the biggest questions in AI without the hype.",
};

export default function FutureBriefingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
