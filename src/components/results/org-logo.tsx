"use client";

import { useState } from "react";
import { getOrgLogoUrl, getOrgInitials } from "@/lib/org-logos";

interface OrgLogoProps {
  sourceOrg: string;
  resourceUrl?: string;
  size?: number;
  className?: string;
}

export function OrgLogo({
  sourceOrg,
  resourceUrl,
  size = 20,
  className = "",
}: OrgLogoProps) {
  const { src } = getOrgLogoUrl(sourceOrg, resourceUrl);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <Initials name={sourceOrg} size={size} className={className} />
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`rounded object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

function Initials({
  name,
  size,
  className,
}: {
  name: string;
  size: number;
  className?: string;
}) {
  const initials = getOrgInitials(name);
  const fontSize = size * 0.45;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded bg-muted text-muted-foreground ${className}`}
      style={{ width: size, height: size, fontSize }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
