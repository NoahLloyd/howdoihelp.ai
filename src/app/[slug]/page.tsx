import { createAuthClient } from "@/lib/supabase-server";
import type { CreatorFlowStep, CreatorPageData } from "@/types";
import { CreatorFlow } from "@/components/funnel/creator-flow";
import { ReferralRedirect } from "./referral-redirect";

interface SlugPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Catch-all for dynamic slugs.
 * 1. Check if slug matches an active creator page → render their custom flow
 * 2. Otherwise → fall through to referral redirect (existing behavior)
 */
export default async function SlugPage({ params }: SlugPageProps) {
  const { slug } = await params;

  // Check for a creator page with this slug
  const supabase = await createAuthClient();
  const { data: creatorPage } = await supabase
    .from("creator_pages")
    .select("*")
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (creatorPage) {
    const page = creatorPage as CreatorPageData;
    return (
      <CreatorFlow
        flowConfig={page.flow_config}
        overrides={{
          excluded_resources: page.excluded_resources,
          boosted_resources: page.boosted_resources,
          resource_weights: page.resource_weights,
        }}
        slug={page.slug}
      />
    );
  }

  // No creator page found - use existing referral redirect behavior
  return <ReferralRedirect slug={slug} />;
}
