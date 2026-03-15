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
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">{tr.events.title}</h2>
        <p className="text-slate-500 mt-1">{tr.events.subtitle}</p>
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {events.map((event, idx) => {
          const eventDate = new Date(event.date + "T12:00:00");
          const month = eventDate.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { month: "short" }).toUpperCase();
          const day = eventDate.getDate();

          return (
            <div key={event.id} className="flex gap-4">
              {/* Date Badge */}
              <div className="flex-shrink-0 w-16 text-center">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-2">
                  <p className="text-xs font-bold text-slate-500">{month}</p>
                  <p className="text-2xl font-bold text-slate-900">{day}</p>
                </div>
                {idx < events.length - 1 && (
                  <div className="w-px h-8 bg-gray-200 mx-auto mt-2" />
                )}
              </div>

              {/* Event Card */}
              <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-5 card-hover">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-900 text-lg">{event.name}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${typeColors[event.type]}`}>
                        {typeLabel(event.type)}
                      </span>
                      <span className="flex items-center gap-1 text-sm text-slate-500">
                        <MapPin size={12} />
                        {event.location}
                      </span>
                      {event.end_date && (
                        <span className="flex items-center gap-1 text-sm text-slate-500">
                          <CalendarDays size={12} />
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
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>

                <p className="text-sm text-slate-600 mb-3">
                  {lang === "pt" ? event.description_pt : event.description_en}
                </p>

                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex items-start gap-2">
                  <Lightbulb size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-amber-800 mb-0.5">
                      {lang === "pt" ? "Oportunidade de Conteúdo" : "Content Opportunity"}
                    </p>
                    <p className="text-sm text-amber-700">
                      {lang === "pt" ? event.content_opportunity_pt : event.content_opportunity_en}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
