import React, { useState, useMemo } from "react";
import { APIProvider, Map as GMap, AdvancedMarker, InfoWindow } from "@vis.gl/react-google-maps";
import { AlertTriangle, Calendar, Store, Layers, Eye, EyeOff, ExternalLink } from "lucide-react";
import type { Lang } from "@/lib/i18n";

// ─── Brazilian city coordinates (expanded) ──────────────────────────────────

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "Ribeirão Preto, SP": { lat: -21.170, lng: -47.810 },
  "São Paulo, SP": { lat: -23.550, lng: -46.633 },
  "Cuiabá, MT": { lat: -15.598, lng: -56.094 },
  "Não-Me-Toque, RS": { lat: -28.460, lng: -52.793 },
  "Curitiba, PR": { lat: -25.428, lng: -49.273 },
  "Brasília, DF": { lat: -15.780, lng: -47.929 },
  "Goiânia, GO": { lat: -16.686, lng: -49.264 },
  "Sinop, MT": { lat: -11.864, lng: -55.505 },
  "Cascavel, PR": { lat: -24.957, lng: -53.459 },
  "Campinas, SP": { lat: -22.906, lng: -47.061 },
  "Londrina, PR": { lat: -23.304, lng: -51.169 },
  "Dourados, MS": { lat: -22.221, lng: -54.805 },
  "Sorriso, MT": { lat: -12.545, lng: -55.726 },
  "Maringá, PR": { lat: -23.420, lng: -51.933 },
  "Luis Eduardo Magalhães, BA": { lat: -12.096, lng: -45.795 },
  "Passo Fundo, RS": { lat: -28.261, lng: -52.408 },
  "Campo Grande, MS": { lat: -20.449, lng: -54.620 },
  "Patos de Minas, MG": { lat: -18.579, lng: -46.518 },
  "Ponta Grossa, PR": { lat: -25.095, lng: -50.162 },
  "Rio Paranaíba, MG": { lat: -19.187, lng: -46.244 },
  "Viçosa, MG": { lat: -20.754, lng: -42.882 },
  "Barreiras, BA": { lat: -12.144, lng: -44.997 },
  "Uberlândia, MG": { lat: -18.919, lng: -48.277 },
  "Rondonópolis, MT": { lat: -16.469, lng: -54.636 },
  "Rio Verde, GO": { lat: -17.785, lng: -50.919 },
  "Chapecó, SC": { lat: -27.101, lng: -52.615 },
  "Belo Horizonte, MG": { lat: -19.919, lng: -43.938 },
  "Porto Alegre, RS": { lat: -30.034, lng: -51.229 },
  "Recife, PE": { lat: -8.054, lng: -34.871 },
  "Salvador, BA": { lat: -12.972, lng: -38.512 },
  "Belém, PA": { lat: -1.456, lng: -48.502 },
  "Manaus, AM": { lat: -3.119, lng: -60.022 },
  "Palmas, TO": { lat: -10.184, lng: -48.334 },
  "Teresina, PI": { lat: -5.089, lng: -42.802 },
  "Porto Velho, RO": { lat: -8.760, lng: -63.901 },
  "Florianópolis, SC": { lat: -27.596, lng: -48.549 },
  "Vitória, ES": { lat: -20.319, lng: -40.337 },
  "Natal, RN": { lat: -5.795, lng: -35.209 },
  "João Pessoa, PB": { lat: -7.120, lng: -34.861 },
  "Maceió, AL": { lat: -9.665, lng: -35.735 },
  "Aracaju, SE": { lat: -10.911, lng: -37.072 },
  "São Luís, MA": { lat: -2.530, lng: -44.283 },
  "Fortaleza, CE": { lat: -3.717, lng: -38.543 },
  "Macapá, AP": { lat: 0.035, lng: -51.066 },
  "Boa Vista, RR": { lat: 2.820, lng: -60.674 },
  "Rio Branco, AC": { lat: -9.974, lng: -67.810 },
  "Piracicaba, SP": { lat: -22.725, lng: -47.649 },
  "Jataí, GO": { lat: -17.882, lng: -51.719 },
  "Lucas do Rio Verde, MT": { lat: -13.050, lng: -55.910 },
  "Primavera do Leste, MT": { lat: -15.560, lng: -54.297 },
  "Catalão, GO": { lat: -18.170, lng: -47.944 },
  "Lavras, MG": { lat: -21.245, lng: -45.000 },
  "Uberaba, MG": { lat: -19.749, lng: -47.932 },
  "Presidente Prudente, SP": { lat: -22.126, lng: -51.388 },
  "Jaboticabal, SP": { lat: -21.255, lng: -48.322 },
  "Araçatuba, SP": { lat: -21.209, lng: -50.433 },
};

// UF capital fallback
const UF_COORDS: Record<string, { lat: number; lng: number }> = {
  SP: { lat: -23.55, lng: -46.63 }, PR: { lat: -25.43, lng: -49.27 },
  MG: { lat: -19.92, lng: -43.94 }, GO: { lat: -16.69, lng: -49.26 },
  MT: { lat: -15.60, lng: -56.09 }, MS: { lat: -20.45, lng: -54.62 },
  RS: { lat: -30.03, lng: -51.23 }, SC: { lat: -27.60, lng: -48.55 },
  BA: { lat: -12.97, lng: -38.51 }, PA: { lat: -1.46, lng: -48.50 },
  TO: { lat: -10.18, lng: -48.33 }, MA: { lat: -2.53, lng: -44.28 },
  PI: { lat: -5.09, lng: -42.80 }, CE: { lat: -3.72, lng: -38.54 },
  PE: { lat: -8.05, lng: -34.87 }, RO: { lat: -8.76, lng: -63.90 },
  AM: { lat: -3.12, lng: -60.02 }, DF: { lat: -15.78, lng: -47.93 },
  ES: { lat: -20.32, lng: -40.34 }, RN: { lat: -5.80, lng: -35.21 },
  PB: { lat: -7.12, lng: -34.86 }, AL: { lat: -9.67, lng: -35.74 },
  SE: { lat: -10.91, lng: -37.07 }, RR: { lat: 2.82, lng: -60.67 },
  AP: { lat: 0.04, lng: -51.07 }, AC: { lat: -9.97, lng: -67.81 },
};

function resolveCoords(city?: string | null, state?: string | null): { lat: number; lng: number } | null {
  if (city && state) {
    const key = `${city}, ${state}`;
    if (CITY_COORDS[key]) return CITY_COORDS[key];
  }
  if (city) {
    // Try partial match
    const match = Object.keys(CITY_COORDS).find((k) => k.startsWith(city));
    if (match) return CITY_COORDS[match];
  }
  if (state) {
    const uf = state.trim().toUpperCase();
    if (UF_COORDS[uf]) return UF_COORDS[uf];
  }
  return null;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type MarkerType = "event" | "retailer" | "alert";

type MapMarker = {
  id: string;
  type: MarkerType;
  lat: number;
  lng: number;
  title: string;
  subtitle: string;
  url?: string;
  extra?: React.ReactNode;
};

type LayerConfig = {
  key: MarkerType;
  label: string;
  labelEn: string;
  color: string;
  icon: React.ReactNode;
};

const LAYERS: LayerConfig[] = [
  { key: "event", label: "Eventos", labelEn: "Events", color: "#5B7A2F", icon: <Calendar size={14} /> },
  { key: "alert", label: "Alertas", labelEn: "Alerts", color: "#E53935", icon: <AlertTriangle size={14} /> },
  { key: "retailer", label: "Revendas", labelEn: "Retailers", color: "#E8722A", icon: <Store size={14} /> },
];

// ─── Component ───────────────────────────────────────────────────────────────

interface DashboardMapProps {
  events?: any[];
  liveEvents?: any[];
  retailers?: any[];
  alerts?: any[];
  lang: Lang;
}

export function DashboardMap({ events = [], liveEvents = [], retailers = [], alerts = [], lang }: DashboardMapProps) {
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<Set<MarkerType>>(new Set(["event", "alert", "retailer"]));
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  const MAP_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const toggleLayer = (key: MarkerType) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const markers = useMemo(() => {
    const m: MapMarker[] = [];
    const jitter = () => (Math.random() - 0.5) * 0.015;

    // Live events from AgroAgenda
    for (const ev of liveEvents) {
      if (ev.formato === "Online" || (!ev.cidade && !ev.estado)) continue;
      const coords = resolveCoords(ev.cidade, ev.estado);
      if (!coords) continue;
      m.push({
        id: `lev-${ev.id}`,
        type: "event",
        lat: coords.lat + jitter(),
        lng: coords.lng + jitter(),
        title: ev.nome,
        subtitle: [ev.cidade, ev.estado].filter(Boolean).join(", "),
        url: ev.slug ? `https://agroagenda.agr.br/event/${ev.slug}` : undefined,
        extra: (
          <div className="mt-1 space-y-0.5">
            <p className="text-[11px] text-neutral-500">{ev.dataInicio}</p>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary">{ev.tipo}</span>
          </div>
        ),
      });
    }

    // Mock events (legacy)
    for (const evt of events) {
      if (!evt.location || evt.location === "Online") continue;
      const coords = CITY_COORDS[evt.location];
      if (!coords) continue;
      if (m.some((x) => x.id === `lev-${evt.id}`)) continue; // skip if live version exists
      m.push({
        id: `evt-${evt.id}`,
        type: "event",
        lat: coords.lat + jitter(),
        lng: coords.lng + jitter(),
        title: evt.name,
        subtitle: evt.location,
        extra: <p className="text-[11px] text-neutral-500 mt-1">{new Date(evt.date_start).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")}</p>,
      });
    }

    // Retailers
    for (const ret of retailers) {
      const coords = CITY_COORDS[`${ret.city}, ${ret.state}`] || CITY_COORDS[ret.city];
      if (!coords) continue;
      m.push({
        id: `ret-${ret.id}`,
        type: "retailer",
        lat: coords.lat + jitter(),
        lng: coords.lng + jitter(),
        title: ret.name,
        subtitle: `${ret.city}, ${ret.state}`,
      });
    }

    // Alerts
    for (const alt of alerts) {
      let coords = { lat: -15.780, lng: -47.929 };
      if (alt.commodity_id === "coffee") coords = CITY_COORDS["Ribeirão Preto, SP"];
      if (alt.commodity_id === "soy") coords = CITY_COORDS["Sorriso, MT"];
      m.push({
        id: `alt-${alt.id}`,
        type: "alert",
        lat: coords.lat + jitter(),
        lng: coords.lng + jitter(),
        title: lang === "pt" ? "Alerta de Mercado" : "Market Alert",
        subtitle: lang === "pt" ? alt.message_pt : alt.message_en,
        extra: <p className="text-[11px] text-error font-medium mt-1">{lang === "pt" ? "Risco Alto" : "High Risk"}</p>,
      });
    }

    return m;
  }, [events, liveEvents, retailers, alerts, lang]);

  const visibleMarkers = markers.filter((m) => visibleLayers.has(m.type));
  const activeMarker = visibleMarkers.find((m) => m.id === activeMarkerId);

  // Layer counts
  const counts: Record<MarkerType, number> = {
    event: markers.filter((m) => m.type === "event").length,
    alert: markers.filter((m) => m.type === "alert").length,
    retailer: markers.filter((m) => m.type === "retailer").length,
  };

  return (
    <div className="relative w-full h-[400px] bg-neutral-100 rounded-b-lg overflow-hidden">
      {MAP_KEY ? (
        <APIProvider apiKey={MAP_KEY}>
          <GMap
            defaultCenter={{ lat: -15.7801, lng: -47.9292 }}
            defaultZoom={4}
            mapId="dashboard-intel-map"
            disableDefaultUI={true}
            zoomControl={true}
          >
            {visibleMarkers.map((m) => (
              <AdvancedMarker
                key={m.id}
                position={{ lat: m.lat, lng: m.lng }}
                onClick={() => setActiveMarkerId(m.id)}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white border-2 border-white shadow-md cursor-pointer transition-transform hover:scale-110"
                  style={{ backgroundColor: LAYERS.find((l) => l.key === m.type)?.color || "#5B7A2F" }}
                >
                  {m.type === "event" && <Calendar size={14} />}
                  {m.type === "retailer" && <Store size={14} />}
                  {m.type === "alert" && <AlertTriangle size={14} />}
                </div>
              </AdvancedMarker>
            ))}

            {activeMarker && (
              <InfoWindow
                position={{ lat: activeMarker.lat, lng: activeMarker.lng }}
                onCloseClick={() => setActiveMarkerId(null)}
                pixelOffset={[0, -10]}
              >
                <div className="p-1 max-w-[220px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: LAYERS.find((l) => l.key === activeMarker.type)?.color }} />
                    <span className="text-[10px] font-semibold text-neutral-500 uppercase">{activeMarker.type}</span>
                  </div>
                  <h4 className="font-semibold text-neutral-900 text-[13px] leading-tight mb-0.5">{activeMarker.title}</h4>
                  <p className="text-[12px] text-neutral-600 leading-snug">{activeMarker.subtitle}</p>
                  {activeMarker.extra}
                  {activeMarker.url && (
                    <a href={activeMarker.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-medium text-brand-primary hover:underline">
                      {lang === "pt" ? "Ver detalhes" : "View details"} <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </InfoWindow>
            )}
          </GMap>
        </APIProvider>
      ) : (
        <div className="flex items-center justify-center h-full p-8 text-neutral-500 text-sm">
          Google Maps API key not configured.
        </div>
      )}

      {/* Layer Control */}
      <div className="absolute top-3 right-3 z-10">
        <button
          onClick={() => setLayerMenuOpen(!layerMenuOpen)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg shadow-md text-[12px] font-semibold transition-colors ${layerMenuOpen ? "bg-brand-primary text-white" : "bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-50"}`}
        >
          <Layers size={15} />
          {lang === "pt" ? "Camadas" : "Layers"}
        </button>

        {layerMenuOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-lg border border-neutral-200 shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-neutral-100 bg-neutral-50">
              <span className="text-[11px] font-semibold text-neutral-500 uppercase">
                {lang === "pt" ? "Camadas do Mapa" : "Map Layers"}
              </span>
            </div>
            {LAYERS.map((layer) => {
              const isVisible = visibleLayers.has(layer.key);
              return (
                <button
                  key={layer.key}
                  onClick={() => toggleLayer(layer.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${isVisible ? "bg-white" : "bg-neutral-50 opacity-60"} hover:bg-neutral-50`}
                >
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center text-white flex-shrink-0"
                    style={{ backgroundColor: isVisible ? layer.color : "#D1D5DB" }}
                  >
                    {layer.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-neutral-900">
                      {lang === "pt" ? layer.label : layer.labelEn}
                    </p>
                    <p className="text-[10px] text-neutral-400">{counts[layer.key]} {lang === "pt" ? "pontos" : "points"}</p>
                  </div>
                  {isVisible ? (
                    <Eye size={14} className="text-neutral-400 flex-shrink-0" />
                  ) : (
                    <EyeOff size={14} className="text-neutral-300 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend bar */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm border border-neutral-200">
        {LAYERS.map((l) => (
          <div key={l.key} className={`flex items-center gap-1.5 text-[10px] font-semibold ${visibleLayers.has(l.key) ? "text-neutral-700" : "text-neutral-300 line-through"}`}>
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: visibleLayers.has(l.key) ? l.color : "#D1D5DB" }} />
            {lang === "pt" ? l.label : l.labelEn} ({counts[l.key]})
          </div>
        ))}
      </div>
    </div>
  );
}
