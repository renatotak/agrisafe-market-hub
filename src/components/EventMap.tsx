"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { Lang } from "@/lib/i18n";

// Fix generic Leaflet icon missing issues in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

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

const geoMocks: Record<string, [number, number]> = {
  "SÃO PAULO": [-23.5505, -46.6333],
  "RIBEIRÃO PRETO": [-21.1704, -47.8103],
  "SÃO JOSÉ DOS CAMPOS": [-23.2237, -45.9009],
  "CAMPINAS": [-22.9099, -47.0626],
  "SORRISO": [-12.5456, -55.7267],
  "CUIABÁ": [-15.5954, -56.0926],
  "LUCAS DO RIO VERDE": [-13.045, -55.9103],
  "SINOP": [-11.8642, -55.5057],
  "CASCAVEL": [-24.9573, -53.459],
  "LONDRINA": [-23.3103, -51.1628],
  "MARINGÁ": [-23.4205, -51.9333],
  "CURITIBA": [-25.4284, -49.2733],
  "PASSO FUNDO": [-28.2612, -52.4083],
  "NÃO-ME-TOQUE": [-28.4619, -52.7936],
  "SANTA MARIA": [-29.6842, -53.8069],
  "GOIÂNIA": [-16.6869, -49.2648],
  "RIO VERDE": [-17.7891, -50.9257],
  "JATAÍ": [-18.8808, -51.7225],
  "CRISTALINA": [-16.7686, -47.6136],
  "LUÍS EDUARDO MAGALHÃES": [-12.0963, -45.795],
  "BARREIRAS": [-12.1462, -44.9961],
  "BALSAS": [-7.5312, -46.0361],
  "UBERLÂNDIA": [-18.9189, -48.2772],
  "UBERABA": [-19.7483, -47.935],
  "PATOS DE MINAS": [-18.5786, -46.5181],
  "BRASÍLIA": [-15.7939, -47.8828]
};

const mapLocation = (locationString: string): [number, number] | null => {
  const upperLoc = locationString.toUpperCase();
  for (const [city, coords] of Object.entries(geoMocks)) {
    if (upperLoc.includes(city)) {
      return coords;
    }
  }
  // Default to somewhere central if not found but is in Brazil.
  return [-15.7939, -47.8828]; // Brasília
};

const typeColors: Record<string, string> = {
  conference: "#2563eb", // blue-600
  webinar: "#0d9488",    // teal-600
  fair: "#d97706",       // amber-600
  workshop: "#9333ea",   // purple-600
  summit: "#e11d48",     // rose-600
};

export default function EventMap({ events, lang }: { events: AgroEvent[], lang: Lang }) {
  // Brazilian center bounds
  const center: [number, number] = [-15.0, -52.0];
  const zoom = 4;

  const validEvents = events.map(e => ({
    ...e,
    coords: mapLocation(e.location)
  })).filter(e => e.coords !== null);

  return (
    <div className="h-[500px] w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative z-0">
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={true} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {validEvents.map((event, idx) => {
          if (!event.coords) return null;
          return (
            <CircleMarker
              key={`${event.id}-${idx}`}
              center={event.coords}
              radius={8}
              fillOpacity={0.8}
              fillColor={typeColors[event.type] || "#475569"}
              color="#ffffff"
              weight={2}
            >
              <Popup className="min-w-[280px]">
                <div className="p-1">
                  <h3 className="font-bold text-slate-900 leading-tight mb-1">{event.name}</h3>
                  <div className="text-xs text-slate-500 mb-2 font-medium">{event.date} &bull; {event.location}</div>
                  
                  <div className="text-sm text-slate-700 leading-snug mb-3">
                    {lang === "pt" ? event.description_pt : event.description_en}
                  </div>
                  
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <span className="text-xs font-semibold uppercase text-slate-400 block mb-1">
                      {lang === "pt" ? "Oportunidade de Conteúdo" : "Content Opp"}
                    </span>
                    <span className="text-sm font-medium text-amber-700">
                      {lang === "pt" ? event.content_opportunity_pt : event.content_opportunity_en}
                    </span>
                  </div>

                  {event.website && (
                    <a href={event.website} target="_blank" rel="noreferrer" className="block mt-3 text-sm text-blue-600 hover:text-blue-700 font-semibold text-center border border-blue-100 rounded-md py-1.5 transition-colors">
                      {lang === "pt" ? "Site Oficial" : "Official Website"}
                    </a>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
