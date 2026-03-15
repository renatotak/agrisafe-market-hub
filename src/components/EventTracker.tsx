"use client";

import { Lang, t } from "@/lib/i18n";
import { agroEvents } from "@/data/events";
import { MapPin, ExternalLink, Lightbulb, CalendarDays } from "lucide-react";

const typeColors: Record<string, string> = {
  conference: "bg-blue-100 text-blue-700",
  webinar: "bg-teal-100 text-teal-700",
  fair: "bg-amber-100 text-amber-700",
  workshop: "bg-purple-100 text-purple-700",
  summit: "bg-rose-100 text-rose-700",
};

export function EventTracker({ lang }: { lang: Lang }) {
  const tr = t(lang);

  const sortedEvents = [...agroEvents].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

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

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">{tr.events.title}</h2>
        <p className="text-slate-500 mt-1">{tr.events.subtitle}</p>
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {sortedEvents.map((event, idx) => {
          const eventDate = new Date(event.date);
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
                {idx < sortedEvents.length - 1 && (
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
                      {event.endDate && (
                        <span className="flex items-center gap-1 text-sm text-slate-500">
                          <CalendarDays size={12} />
                          {event.date} → {event.endDate}
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
                      {lang === "pt" ? event.contentOpportunity_pt : event.contentOpportunity_en}
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
