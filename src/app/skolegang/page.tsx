import type { Metadata } from "next";
import { SkolegangLanding } from "./landing";

export const metadata: Metadata = {
  title: "Hvad kan du gøre? | AI sikkerhed",
  description:
    "Du har hørt advarslerne om AI. Her er hvad du konkret kan gøre for at hjælpe.",
  openGraph: {
    title: "Hvad kan du gøre? | AI sikkerhed",
    description:
      "Du har hørt advarslerne om AI. Her er hvad du konkret kan gøre for at hjælpe.",
  },
};

export default function SkolegangPage() {
  return <SkolegangLanding />;
}
