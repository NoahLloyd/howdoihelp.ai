"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Resource } from "@/types";
import { SubmitForm } from "@/components/public/submit-form";
import { CATEGORIES } from "@/lib/categories";
import { ArrowRight, Search, Globe2, Clock, GraduationCap } from "lucide-react";

interface ProgramsClientPageProps {
  resources: Resource[];
}

export function ProgramsClientPage({ resources }: ProgramsClientPageProps) {
  const [search, setSearch] = useState("");
  const [showSubmit, setShowSubmit] = useState(false);

  const filtered = useMemo(() => {
    let items = resources;

    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          (r.source_org || "").toLowerCase().includes(q) ||
          r.location.toLowerCase().includes(q)
      );
    }

    // Sort: programs with upcoming deadlines first, then by impact
    items = [...items].sort((a, b) => {
      // Programs with deadlines come first
      if (a.deadline_date && !b.deadline_date) return -1;
      if (!a.deadline_date && b.deadline_date) return 1;
      if (a.deadline_date && b.deadline_date) {
        return a.deadline_date.localeCompare(b.deadline_date);
      }
      return b.ev_general - a.ev_general;
    });

    return items;
  }, [resources, search]);

  // Split into active-deadline and ongoing
  const { withDeadline, ongoing } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dl: Resource[] = [];
    const on: Resource[] = [];

    for (const r of filtered) {
      if (r.deadline_date) {
        const deadline = new Date(r.deadline_date);
        if (deadline >= today) {
          dl.push(r);
        } else {
          on.push(r); // past deadline, treat as ongoing
        }
      } else {
        on.push(r);
      }
    }

    return { withDeadline: dl, ongoing: on };
  }, [filtered]);

  return (
    <div className="min-h-dvh bg-background text-foreground selection:bg-accent/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-32">
        <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3">
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tighter hover:tracking-tight transition-all duration-700">
              Programs Database
            </h1>
            <p className="text-muted-foreground text-lg">
              AI safety courses, fellowships, grants, and training programs.
            </p>
          </div>
          <button
            onClick={() => setShowSubmit(true)}
            className="group relative h-10 px-5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all flex items-center justify-center cursor-pointer flex-shrink-0 whitespace-nowrap"
          >
            Submit Program{" "}
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </button>
        </header>

        {/* Controls Bar */}
        <div className="bg-card border border-border p-2 rounded-xl mb-8 flex items-center shadow-sm">
          <div className="flex-1 flex items-center px-3 gap-3">
            <Search className="w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search courses, fellowships, grants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent border-none py-2 focus:outline-none text-base placeholder:text-muted"
            />
          </div>
        </div>

        {/* Table View */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden text-left">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs font-mono text-muted-foreground uppercase tracking-widest border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium min-w-[300px]">
                    Program
                  </th>
                  <th className="px-6 py-4 font-medium whitespace-nowrap">
                    Location
                  </th>
                  <th className="px-6 py-4 font-medium whitespace-nowrap">
                    Organization
                  </th>
                  <th className="px-6 py-4 font-medium whitespace-nowrap">
                    Deadline
                  </th>
                  <th className="px-6 py-4 font-medium text-right whitespace-nowrap">
                    Link
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {/* Programs with upcoming deadlines */}
                {withDeadline.length > 0 && (
                  <>
                    <tr className="bg-accent/5">
                      <td
                        colSpan={5}
                        className="px-6 py-2 border-b border-accent/20"
                      >
                        <div className="flex items-center gap-2 text-xs font-mono font-semibold text-accent uppercase tracking-widest">
                          <Clock className="w-3.5 h-3.5" /> Upcoming Deadlines
                        </div>
                      </td>
                    </tr>
                    {withDeadline.map((program) => (
                      <ProgramTableRow
                        key={program.id}
                        program={program}
                        isHighlighted={true}
                      />
                    ))}
                  </>
                )}

                {/* Ongoing programs */}
                {ongoing.length > 0 && (
                  <>
                    {withDeadline.length > 0 && (
                      <tr className="bg-muted/10">
                        <td
                          colSpan={5}
                          className="px-6 py-2 border-b border-border/50"
                        >
                          <div className="flex items-center gap-2 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-widest">
                            <GraduationCap className="w-3.5 h-3.5" /> All
                            Programs
                          </div>
                        </td>
                      </tr>
                    )}
                    {ongoing.map((program) => (
                      <ProgramTableRow
                        key={program.id}
                        program={program}
                        isHighlighted={false}
                      />
                    ))}
                  </>
                )}

                {/* Empty state */}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-muted font-mono"
                    >
                      No programs found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* API link */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 -mt-20 pb-16 text-center">
        <p className="text-xs text-muted-foreground">
          This data is available via our{" "}
          <Link href="/developers" className="text-accent hover:underline">
            free public API
          </Link>
        </p>
      </div>

      {showSubmit && (
        <SubmitForm
          category={CATEGORIES.find((c) => c.id === "programs")!}
          onClose={() => setShowSubmit(false)}
        />
      )}
    </div>
  );
}

function ProgramTableRow({
  program,
  isHighlighted,
}: {
  program: Resource;
  isHighlighted: boolean;
}) {
  const isOnline =
    program.location.toLowerCase() === "online" ||
    program.location.toLowerCase() === "global";

  const deadlineStr = program.deadline_date
    ? new Date(program.deadline_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Rolling";

  return (
    <tr
      className={`group transition-all ${isHighlighted ? "bg-accent/5 hover:bg-accent/10" : "hover:bg-muted/10"}`}
    >
      {/* Title & Desc */}
      <td className="px-6 pt-4 pb-5 align-top">
        <a
          href={program.url}
          target="_blank"
          rel="noreferrer"
          className="block outline-none hover:underline decoration-accent underline-offset-4"
        >
          <div className="font-medium text-base mb-1 text-foreground">
            {program.title}
          </div>
          {program.description && (
            <div className="text-sm text-muted-foreground line-clamp-2 leading-relaxed font-light">
              {program.description}
            </div>
          )}
        </a>
      </td>

      {/* Location */}
      <td className="px-6 py-4 align-top whitespace-nowrap">
        <div
          className={`flex items-center gap-1.5 text-sm ${isOnline ? "text-muted-foreground" : "text-foreground"}`}
        >
          <Globe2 className="w-3.5 h-3.5" />
          {program.location}
        </div>
      </td>

      {/* Organization */}
      <td className="px-6 py-4 align-top whitespace-nowrap">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <GraduationCap className="w-3.5 h-3.5 opacity-70" />
          {program.source_org}
        </div>
      </td>

      {/* Deadline */}
      <td className="px-6 py-4 align-top whitespace-nowrap">
        <div
          className={`font-mono text-sm tracking-tight ${isHighlighted ? "text-accent font-semibold" : "text-muted-foreground"}`}
        >
          {deadlineStr}
        </div>
      </td>

      {/* Action */}
      <td className="px-6 py-4 align-top text-right">
        <a
          href={program.url}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors
            ${
              isHighlighted
                ? "border-accent text-accent hover:bg-accent hover:text-accent-foreground"
                : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
            }`}
        >
          <ArrowRight className="w-4 h-4 -rotate-45" />
        </a>
      </td>
    </tr>
  );
}
