"use client";

import Image from "next/image";


export type BrandConfig = {
  id: "vin" | "aimworried";
  displayName: string;
  tagline: string;
  avatarSrc: string;
  /** If set, a wordmark is shown alongside the avatar+name row. */
  wordmark?: {
    primary: string;
    secondary: string;
    color: string;
  };
};

export const VIN_BRAND: BrandConfig = {
  id: "vin",
  displayName: "Vin Sixsmith",
  tagline: "AI safety, unpacked.",
  avatarSrc: "/vin/avatar.jpg",
};

export const AIMWORRIED_BRAND: BrandConfig = {
  id: "aimworried",
  displayName: "Vin Sixsmith",
  tagline: "AI safety, unpacked.",
  avatarSrc: "/aimworried/avatar.jpg",
  wordmark: {
    primary: "AI'M",
    secondary: "worried",
    color: "#2F3FD9",
  },
};

/**
 * Compact sticky header rendered above whichever funnel variant is selected.
 * Keeps the branding visible across every step of the flow without touching
 * the underlying funnel components.
 */
export function BrandedHeader({ brand }: { brand: BrandConfig }) {
  return (
    <header
      className="sticky top-0 z-30 w-full border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70"
    >
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 ring-white/80 shadow-sm">
            <Image
              src={brand.avatarSrc}
              alt={brand.displayName}
              fill
              sizes="36px"
              className="object-cover"
              priority
            />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-semibold tracking-tight">
              {brand.displayName}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {brand.tagline}
            </p>
          </div>
        </div>

        {brand.wordmark && (
          <div
            className="shrink-0 font-extrabold leading-none tracking-tight"
            style={{ color: brand.wordmark.color }}
            aria-label={`${brand.wordmark.primary} ${brand.wordmark.secondary}`}
          >
            <span className="block text-[15px] sm:text-[17px]">
              {brand.wordmark.primary}
            </span>
            <span className="block text-[15px] sm:text-[17px]">
              {brand.wordmark.secondary}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

/**
 * First-paint skeleton shown while the variant is being picked from the
 * cookie. Mirrors the same sticky branded header and a neutral stack of
 * placeholder blocks that could plausibly be any of the three variants, so
 * the layout doesn't jump when the real content swaps in.
 */
export function BrandedSkeleton({ brand }: { brand: BrandConfig }) {
  return (
    <>
      <BrandedHeader brand={brand} />
      <main
        className="shimmer-container mx-auto flex min-h-[calc(100dvh-56px)] w-full max-w-lg flex-col px-6 pt-12 pb-16"
        aria-busy="true"
        aria-label="Loading"
      >
        <div className="mt-2 h-9 w-3/4 rounded-md shimmer-bg bg-border/60" />
        <div className="mt-4 h-4 w-full rounded shimmer-bg bg-border/60" />
        <div className="mt-2 h-4 w-2/3 rounded shimmer-bg bg-border/60" />

        <div className="mt-10 flex flex-col gap-3">
          <div className="h-14 rounded-xl shimmer-bg bg-border/60" />
          <div className="h-14 rounded-xl shimmer-bg bg-border/60" />
          <div className="h-14 rounded-xl shimmer-bg bg-border/60" />
        </div>
      </main>
    </>
  );
}
