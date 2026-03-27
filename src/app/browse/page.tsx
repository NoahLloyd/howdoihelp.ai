"use client";

import { useEffect } from "react";
import { BrowseResults } from "@/components/funnel/browse-results";
import { identifyVariant, trackFunnelStarted } from "@/lib/tracking";

export default function BrowsePage() {
  useEffect(() => {
    identifyVariant("B");
    trackFunnelStarted("B");
  }, []);

  return <BrowseResults variant="B" />;
}
