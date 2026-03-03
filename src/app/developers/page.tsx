import type { Metadata } from "next";
import { DeveloperDocs } from "./developer-docs";

export const metadata: Metadata = {
  title: "Developer API | howdoihelp.ai",
  description:
    "Free public API for AI safety communities and events data. Access the most comprehensive directory of AI safety resources programmatically.",
};

export default function DevelopersPage() {
  return <DeveloperDocs />;
}
