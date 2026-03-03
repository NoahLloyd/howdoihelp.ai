"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import type { Resource, GeoData } from "@/types";
import { getGeoData } from "@/lib/geo";
import { SubmitForm } from "@/components/public/submit-form";
import { CATEGORIES } from "@/lib/categories";
import { ArrowRight, MapPin, Calendar, Globe2, Search } from "lucide-react";

interface EventsClientPageProps {
  resources: Resource[];
}

function matchesLocation(locationString: string, geo: GeoData | null) {
  if (!geo) return false;
  if (!locationString) return false;
  
  const ls = locationString.toLowerCase();
  
  // Custom aliases for major tech hubs
  if (geo.city === "San Francisco" && (ls.includes("sf") || ls.includes("bay area") || ls.includes("silicon valley"))) return true;
  if (geo.city === "New York" && (ls.includes("nyc") || ls.includes("new york") || ls.includes("manhattan") || ls.includes("brooklyn"))) return true;
  if (geo.city === "London" && (ls.includes("uk") || ls.includes("united kingdom"))) return true;

  if (geo.city && ls.includes(geo.city.toLowerCase())) return true;
  if (geo.region && ls.includes(geo.region.toLowerCase())) return true;

  return false;
}

export function EventsClientPage({ resources }: EventsClientPageProps) {
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [search, setSearch] = useState("");
  const [showSubmit, setShowSubmit] = useState(false);

  useEffect(() => {
    getGeoData().then((data) => {
      setGeo(data);
    }).finally(() => setLoadingGeo(false));
  }, []);

  // Pre-process and filter
  const { localEvents, onlineEvents, otherEvents } = useMemo(() => {
    const validEvents = resources.filter(r => {
        if (r.event_date) {
            const eventDate = new Date(r.event_date);
            const today = new Date(new Date().setHours(0,0,0,0));
            if (eventDate < today) return false;
        }
        return true;
    });

    const searchedEvents = search ? validEvents.filter(r => 
        r.title.toLowerCase().includes(search.toLowerCase()) || 
        r.location.toLowerCase().includes(search.toLowerCase()) ||
        (r.source_org || "").toLowerCase().includes(search.toLowerCase())
    ) : validEvents;
    
    // Sort chronologically
    searchedEvents.sort((a, b) => {
        if (!a.event_date) return 1;
        if (!b.event_date) return -1;
        return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
    });

    const locals: Resource[] = [];
    const onlines: Resource[] = [];
    const others: Resource[] = [];

    searchedEvents.forEach(e => {
        const locLower = e.location.toLowerCase();
        const isOnline = locLower === "online" || locLower === "global";
        
        if (matchesLocation(e.location, geo)) {
            locals.push(e);
        } else if (isOnline) {
            onlines.push(e);
        } else {
            others.push(e);
        }
    });

    return { localEvents: locals, onlineEvents: onlines, otherEvents: others };
  }, [resources, search, geo]);

  return (
    <div className="min-h-dvh bg-background text-foreground selection:bg-accent/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-32">
        <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3">
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tighter hover:tracking-tight transition-all duration-700">
              Events Database
            </h1>
            <p className="text-muted-foreground text-lg">The most comprehensive directory of upcoming AI safety hackathons, fellowships, and conferences.</p>
          </div>
          <button
            onClick={() => setShowSubmit(true)}
            className="group relative h-10 px-5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all flex items-center justify-center cursor-pointer flex-shrink-0 whitespace-nowrap"
          >
            Submit Event <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </button>
        </header>

        {/* Controls Bar */}
        <div className="bg-card border border-border p-2 rounded-xl mb-8 flex items-center shadow-sm">
           <div className="flex-1 flex items-center px-3 gap-3">
              <Search className="w-5 h-5 text-muted-foreground" />
              <input 
                  type="text"
                  placeholder="Search over all upcoming events worldwide..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
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
                           <th className="px-6 py-4 font-medium whitespace-nowrap w-40">Date</th>
                           <th className="px-6 py-4 font-medium min-w-[300px]">Event Name</th>
                           <th className="px-6 py-4 font-medium whitespace-nowrap">Location</th>
                           <th className="px-6 py-4 font-medium whitespace-nowrap">Organizer</th>
                           <th className="px-6 py-4 font-medium text-right whitespace-nowrap">Link</th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-border/50">
                       
                       {/* 1. Local Events (Highest Priority) */}
                       {localEvents.length > 0 && (
                          <>
                             <tr className="bg-accent/5">
                                <td colSpan={5} className="px-6 py-2 border-b border-accent/20">
                                   <div className="flex items-center gap-2 text-xs font-mono font-semibold text-accent uppercase tracking-widest">
                                       <MapPin className="w-3.5 h-3.5" /> Happening near {geo?.city || "you"}
                                   </div>
                                </td>
                             </tr>
                             {localEvents.map((event) => (
                                 <EventTableRow key={event.id} event={event} isHighlighted={true} opacityClass="" />
                             ))}
                          </>
                       )}

                       {/* 2. Online Events (Middle Priority) */}
                       {onlineEvents.length > 0 && (
                           <>
                             {localEvents.length > 0 && (
                               <tr className="bg-muted/10">
                                  <td colSpan={5} className="px-6 py-2 border-b border-border/50">
                                     <div className="flex items-center gap-2 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-widest">
                                         <Globe2 className="w-3.5 h-3.5" /> Global & Online
                                     </div>
                                  </td>
                               </tr>
                             )}
                             {onlineEvents.map(event => (
                                 <EventTableRow key={event.id} event={event} isHighlighted={false} opacityClass="" />
                             ))}
                           </>
                       )}

                       {/* 3. Other Physical Events (Lowest Priority, visually dimmed heavily) */}
                       {otherEvents.length > 0 && (
                           <>
                             {(localEvents.length > 0 || onlineEvents.length > 0) && (
                               <tr className="bg-muted/5 opacity-70 hover:opacity-100 transition-opacity">
                                  <td colSpan={5} className="px-6 py-2 border-b border-border/50">
                                     <div className="flex items-center gap-2 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-widest">
                                         Elsewhere Worldwide
                                     </div>
                                  </td>
                               </tr>
                             )}
                             {otherEvents.map(event => (
                                 <EventTableRow key={event.id} event={event} isHighlighted={false} opacityClass="opacity-70 hover:opacity-100" />
                             ))}
                           </>
                       )}

                       {/* Placeholders */}
                       {loadingGeo && localEvents.length === 0 && onlineEvents.length === 0 && otherEvents.length === 0 && (
                           <tr>
                               <td colSpan={5} className="px-6 py-12 text-center text-muted font-mono animate-pulse">
                                   Acquiring location data...
                               </td>
                           </tr>
                       )}

                       {!loadingGeo && localEvents.length === 0 && onlineEvents.length === 0 && otherEvents.length === 0 && (
                           <tr>
                               <td colSpan={5} className="px-6 py-12 text-center text-muted font-mono">
                                   No events found matching your criteria.
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
          <Link
            href="/developers"
            className="text-accent hover:underline"
          >
            free public API
          </Link>
        </p>
      </div>

      {showSubmit && (
        <SubmitForm
          category={CATEGORIES.find(c => c.id === "events")!}
          onClose={() => setShowSubmit(false)}
        />
      )}
    </div>
  );
}

function EventTableRow({ event, isHighlighted, opacityClass = "" }: { event: Resource, isHighlighted: boolean, opacityClass?: string }) {
    const isOnline = event.location.toLowerCase() === "online" || event.location.toLowerCase() === "global";
    const dateStr = event.event_date 
        ? new Date(event.event_date).toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) 
        : "TBD";

    return (
        <tr className={`group transition-all ${opacityClass} ${isHighlighted ? "bg-accent/5 hover:bg-accent/10" : "hover:bg-muted/10"}`}>
            {/* Date */}
            <td className="px-6 py-4 align-top w-40">
                <div className={`font-mono text-sm tracking-tight ${isHighlighted ? "text-accent font-semibold" : "text-foreground"}`}>
                    {dateStr}
                </div>
            </td>
            
            {/* Title & Desc */}
            <td className="px-6 pt-4 pb-5 align-top">
                <a href={event.url} target="_blank" rel="noreferrer" className="block outline-none hover:underline decoration-accent underline-offset-4">
                   <div className={`font-medium text-base mb-1 ${isHighlighted ? "text-foreground" : "text-foreground"}`}>
                       {event.title}
                   </div>
                   {event.description && (
                       <div className="text-sm text-muted-foreground line-clamp-2 leading-relaxed font-light">
                           {event.description}
                       </div>
                   )}
                </a>
            </td>
            
            {/* Location */}
            <td className="px-6 py-4 align-top whitespace-nowrap">
                <div className={`flex items-center gap-1.5 text-sm ${isOnline ? "text-muted-foreground" : isHighlighted ? "text-accent font-medium" : "text-foreground"}`}>
                    {isOnline ? <Globe2 className="w-3.5 h-3.5" /> : <MapPin className={`w-3.5 h-3.5 ${isHighlighted ? "text-accent" : "text-muted-foreground"}`} />}
                    {event.location}
                </div>
            </td>
            
            {/* Organizer */}
            <td className="px-6 py-4 align-top whitespace-nowrap">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5 opacity-70" />
                    {event.source_org}
                </div>
            </td>
            
            {/* Action */}
            <td className="px-6 py-4 align-top text-right">
                <a 
                    href={event.url} 
                    target="_blank" 
                    rel="noreferrer"
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors
                        ${isHighlighted 
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
