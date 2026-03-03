"use client";

import { motion } from "framer-motion";
import type { EnrichedProfile } from "@/types";

interface ProfileConfirmationProps {
  profile: EnrichedProfile;
  onConfirm: () => void;
  onSkip: () => void;
}

/** Split the flat skills array into display-friendly groups */
function groupSkills(skills: string[]) {
  const certs: string[] = [];
  const awards: string[] = [];
  const volunteer: string[] = [];
  const publications: string[] = [];
  const languages: string[] = [];
  const other: string[] = [];

  for (const s of skills) {
    if (s.startsWith("Volunteer: ")) volunteer.push(s.slice(11));
    else if (s.startsWith("Language: ")) languages.push(s.slice(10));
    else if (s.startsWith("Publication: ")) publications.push(s.slice(13));
    else if (s.includes("(") && (s.includes("Certified") || s.includes("IGCSE") || s.includes("Specialist")))
      certs.push(s);
    else if (s.includes("Winner") || s.includes("Place") || s.includes("Award") || s.includes("Champion"))
      awards.push(s);
    else other.push(s);
  }

  return { certs, awards, volunteer, publications, languages, other };
}

export function ProfileConfirmation({
  profile,
  onConfirm,
  onSkip,
}: ProfileConfirmationProps) {
  const hasMeaningfulData = !!(
    profile.fullName ||
    profile.headline ||
    profile.currentTitle ||
    profile.skills.length > 0 ||
    profile.experience.length > 0 ||
    profile.education.length > 0 ||
    (profile.repos && profile.repos.length > 0)
  );

  const groups = groupSkills(profile.skills);

  return (
    <main className="flex min-h-dvh flex-col px-6 py-12">
      <div className="mx-auto w-full max-w-lg">
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          {hasMeaningfulData ? (
            <>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Does this look right?
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                We&apos;ll use this to personalize your recommendations.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Got it!
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                We couldn&apos;t pull your profile details, but we&apos;ll still
                personalize your recommendations using your profile link.
              </p>
            </>
          )}

          {/* Profile card */}
          <div className="mt-6 rounded-xl border border-border bg-card p-5">
            {hasMeaningfulData ? (
              <div className="flex items-start gap-4">
                {profile.photo && (
                  <img
                    src={profile.photo}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-full object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  {profile.fullName && (
                    <h3 className="text-lg font-semibold tracking-tight">
                      {profile.fullName}
                    </h3>
                  )}
                  {profile.headline && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {profile.headline}
                    </p>
                  )}
                  {profile.currentTitle && profile.currentCompany ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {profile.currentTitle} at {profile.currentCompany}
                    </p>
                  ) : profile.currentCompany ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {profile.currentCompany}
                    </p>
                  ) : null}
                  {profile.location && (
                    <p className="mt-1 text-xs text-muted">
                      {profile.location}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10">
                  <span className="text-sm text-accent">
                    {profile.platform === "linkedin" ? "in" :
                     profile.platform === "github" ? "gh" :
                     profile.platform === "x" ? "X" : "~"}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {profile.sourceUrl}
                  </p>
                  <p className="text-xs text-muted capitalize">{profile.platform}</p>
                </div>
              </div>
            )}

            {/* Certifications */}
            {groups.certs.length > 0 && (
              <Section title="Certifications">
                <TagList items={groups.certs} max={6} />
              </Section>
            )}

            {/* Awards */}
            {groups.awards.length > 0 && (
              <Section title="Awards">
                <LineList items={groups.awards} max={4} />
              </Section>
            )}

            {/* Other skills/context */}
            {groups.other.length > 0 && (
              <Section title="Highlights">
                <TagList items={groups.other} max={8} />
              </Section>
            )}

            {/* Experience */}
            {profile.experience.length > 0 && (
              <Section title="Experience">
                <div className="flex flex-col gap-1">
                  {profile.experience.slice(0, 3).map((exp, i) => (
                    <p key={i} className="text-sm text-muted-foreground">
                      {exp.title && exp.company
                        ? `${exp.title} at ${exp.company}`
                        : exp.title || exp.company}
                    </p>
                  ))}
                  {profile.experience.length > 3 && (
                    <p className="text-xs text-muted">
                      +{profile.experience.length - 3} more positions
                    </p>
                  )}
                </div>
              </Section>
            )}

            {/* Education */}
            {profile.education.length > 0 && (
              <Section title="Education">
                <div className="flex flex-col gap-1">
                  {profile.education.slice(0, 2).map((edu, i) => (
                    <p key={i} className="text-sm text-muted-foreground">
                      {[edu.degree, edu.field].filter(Boolean).join(" in ") ||
                        edu.school}
                      {edu.degree || edu.field ? ` — ${edu.school}` : ""}
                    </p>
                  ))}
                </div>
              </Section>
            )}

            {/* Volunteer */}
            {groups.volunteer.length > 0 && (
              <Section title="Volunteer">
                <LineList items={groups.volunteer} max={3} />
              </Section>
            )}

            {/* Publications */}
            {groups.publications.length > 0 && (
              <Section title="Publications">
                <LineList items={groups.publications} max={3} />
              </Section>
            )}

            {/* Languages */}
            {groups.languages.length > 0 && (
              <Section title="Languages">
                <TagList items={groups.languages} max={6} />
              </Section>
            )}

            {/* GitHub repos */}
            {profile.repos && profile.repos.length > 0 && (
              <Section title="Top Repos">
                <div className="flex flex-col gap-1">
                  {profile.repos.slice(0, 3).map((repo) => (
                    <p key={repo.name} className="text-sm text-muted-foreground">
                      {repo.name}
                      {repo.language && (
                        <span className="text-xs text-muted"> · {repo.language}</span>
                      )}
                      {repo.stars > 0 && (
                        <span className="text-xs text-muted"> · {repo.stars} stars</span>
                      )}
                    </p>
                  ))}
                </div>
              </Section>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={onSkip}
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              Skip — don&apos;t personalize
            </button>

            <button
              onClick={onConfirm}
              className="inline-flex h-10 items-center justify-center rounded-full bg-accent px-6 text-sm font-medium text-white transition-all hover:bg-accent-hover"
            >
              {hasMeaningfulData ? "Looks good" : "Continue"}
            </button>
          </div>
        </motion.div>
      </div>
    </main>
  );
}

// ─── Small helpers ───────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted">
        {title}
      </p>
      {children}
    </div>
  );
}

function TagList({ items, max }: { items: string[]; max: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.slice(0, max).map((item) => (
        <span
          key={item}
          className="rounded-full border border-border bg-card-hover px-2.5 py-1 text-xs text-muted-foreground"
        >
          {item}
        </span>
      ))}
      {items.length > max && (
        <span className="rounded-full border border-border bg-card-hover px-2.5 py-1 text-xs text-muted">
          +{items.length - max} more
        </span>
      )}
    </div>
  );
}

function LineList({ items, max }: { items: string[]; max: number }) {
  return (
    <div className="flex flex-col gap-1">
      {items.slice(0, max).map((item, i) => (
        <p key={i} className="text-sm text-muted-foreground">
          {item}
        </p>
      ))}
      {items.length > max && (
        <p className="text-xs text-muted">
          +{items.length - max} more
        </p>
      )}
    </div>
  );
}
