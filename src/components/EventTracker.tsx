"use client";

import { useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { MapPin, ExternalLink, Lightbulb, CalendarDays, Loader2 } from "lucide-react";

interface AgroEvent {
  id: string;
  name: string;
  date: string;
  end_date: string | null;
  location: string;
  type: string;
  description_pt: string;
  description_en: string;
  content_opportunity_pt: string;
  content_opportunity_en: string;
  website: string | null;
  upcoming: boolean;
}

const typeColors: Record<string, string> = {
  conference: "bg-blue-100 text-blue-700",
  webinar: "bg-teal-100 text-teal-700",
  fair: "bg-amber-100 text-amber-700",
  workshop: "bg-purple-100 text-purple-700",
  summit: "bg-rose-100 text-rose-700",
};

export function EventTracker({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [events, setEvents] = useState<AgroEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvents() {
      const { data } = await supabase.from("events").select("*").order("date");
      if (data) setEvents(data);
      setLoading(false);
    }
    fetchEvents();
  }, []);

  const typeLabel = (type: string) => {
    const labels: Record<string, Record<string, string>> = {
      conference: { pt: "Conferência", en: "Conference" },
      webinar: { pt: "Webinar", en: "Webinar" },
      fair: { pt: "Feira", en: "Fair" },
      workshop: { pt: "Workshop", en: "Workshop" },
      summit: { pt: "Summit", en: "Summit" },
    };
    return labels[type]?.[lang] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 pb-8">
      <div className="mb-6 md:mb-8 text-center md:text-left">
        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">{tr.events.title}</h2>
        <p className="text-slate-500 mt-1 text-sm md:text-base">{tr.events.subtitle}</p>
      </div>

      {/* Timeline */}
      <div className="space-y-6 md:space-y-8 relative before:absolute before:inset-0 before:ml-8 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
        {events.map((event, idx) => {
          const eventDate = new Date(event.date + "T12:00:00");
          const month = eventDate.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { month: "short" }).toUpperCase();
          const day = eventDate.getDate();

          return (
            <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
              {/* Event Card */}
              <div className="flex-1 ml-16 md:ml-0 md:w-5/12 bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 p-5 md:p-6 hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-4 gap-3">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-lg md:text-xl tracking-tight leading-tight">{event.name}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md tracking-wide uppercase shadow-sm border border-white/20 ${typeColors[event.type]}`}>
                        {typeLabel(event.type)}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md border border-slate-200/50">
                        <MapPin size={14} className="text-slate-400" />
                        {event.location}
                      </span>
                      {event.end_date && (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md border border-slate-200/50">
                          <CalendarDays size={14} className="text-slate-400" />
                          {event.date} → {event.end_date}
                        </span>
                      )}
                    </div>
                  </div>
                  {event.website && (
                    <a
                      href={event.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex self-start sm:self-auto items-center justify-center p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-white hover:border-slate-300 transition-colors shadow-sm active:scale-95"
                    >
                      <ExternalLink size={18} />
                    </a>
                  )}
                </div>

                <p className="text-sm md:text-base text-slate-600 mb-5 leading-relaxed">
                  {lang === "pt" ? event.description_pt : event.description_en}
                </p>

                <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200/60 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                  <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg shadow-sm">
                    <Lightbulb size={18} className="flex-shrink-0" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-amber-800 uppercase tracking-wider mb-1.5">
                      {lang === "pt" ? "Oportunidade de Conteúdo" : "Content Opportunity"}
                    </p>
                    <p className="text-sm font-medium text-amber-900 leading-snug">
                      {lang === "pt" ? event.content_opportunity_pt : event.content_opportunity_en}
                    </p>
                  </div>
                </div>
              </div>

              {/* Date Badge (Center on Desktop, Left on Mobile) */}
              <div className="absolute left-0 md:left-1/2 md:-translate-x-1/2 flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-md border-4 border-slate-50 z-10 transition-transform group-hover:scale-110">
                <div className="text-center">
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1">{month}</p>
                  <p className="text-2xl font-black text-rose-500 leading-none">{day}</p>
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
