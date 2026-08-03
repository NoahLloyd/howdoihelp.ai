type AlmaAttributionProps = {
  className?: string;
};

export function AlmaAttribution({ className = "" }: AlmaAttributionProps) {
  return (
    <a
      href="https://www.almagrants.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground ${className}`}
      aria-label="A project by Alma"
    >
      <span>A project by</span>
      <span className="inline-flex items-center gap-1 font-semibold tracking-tight text-foreground/80 transition-colors group-hover:text-foreground">
        <svg
          viewBox="0 -8 100 100"
          fill="none"
          aria-hidden="true"
          className="h-[17px] w-[17px]"
        >
          <path
            d="M22 47 Q50 83 78 47"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M50 11 Q53 24 66 27 Q53 30 50 43 Q47 30 34 27 Q47 24 50 11 Z"
            fill="#6f8265"
          />
        </svg>
        Alma
      </span>
    </a>
  );
}
