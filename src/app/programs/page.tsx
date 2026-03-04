import type { Metadata } from "next";
import { fetchPublicResources } from "@/app/admin/actions";
import { ProgramsClientPage } from "./programs-client-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Programs — howdoihelp.ai",
  description: "AI safety courses, fellowships, grants, and training programs.",
};

export default async function ProgramsPublicPage() {
  const resources = await fetchPublicResources("programs");
  return <ProgramsClientPage resources={resources} />;
}
