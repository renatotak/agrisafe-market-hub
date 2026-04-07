"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { APIProvider, Map as GMap, AdvancedMarker, InfoWindow, useMap } from "@vis.gl/react-google-maps";
import {
  Calendar, Eye, EyeOff, ExternalLink,
  CloudRain, Thermometer, MapPin, Search, X, RefreshCw,
  Newspaper, Gavel, AlertCircle, Home, Maximize,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Lang } from "@/lib/i18n";

// ─── City coordinates ──────────────────────────────────────────────────────

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "Ribeirão Preto, SP": { lat: -21.170, lng: -47.810 },
  "São Paulo, SP": { lat: -23.550, lng: -46.633 },
  "Cuiabá, MT": { lat: -15.598, lng: -56.094 },
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
  "Uberlândia, MG": { lat: -18.919, lng: -48.277 },
  "Rondonópolis, MT": { lat: -16.469, lng: -54.636 },
  "Rio Verde, GO": { lat: -17.785, lng: -50.919 },
  "Chapecó, SC": { lat: -27.101, lng: -52.615 },
  "Belo Horizonte, MG": { lat: -19.919, lng: -43.938 },
  "Porto Alegre, RS": { lat: -30.034, lng: -51.229 },
  "Salvador, BA": { lat: -12.972, lng: -38.512 },
  "Belém, PA": { lat: -1.456, lng: -48.502 },
  "Palmas, TO": { lat: -10.184, lng: -48.334 },
  "Florianópolis, SC": { lat: -27.596, lng: -48.549 },
  "Piracicaba, SP": { lat: -22.725, lng: -47.649 },
  "Jataí, GO": { lat: -17.882, lng: -51.719 },
  "Lucas do Rio Verde, MT": { lat: -13.050, lng: -55.910 },
  "Primavera do Leste, MT": { lat: -15.560, lng: -54.297 },
  "Barreiras, BA": { lat: -12.144, lng: -44.997 },
};

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

const ALL_UFS = Object.keys(UF_COORDS).sort();

function resolveCoords(city?: string | null, state?: string | null): { lat: number; lng: number } | null {
  if (city && state) {
    const key = `${city}, ${state}`;
    if (CITY_COORDS[key]) return CITY_COORDS[key];
  }
  if (city) {
    const match = Object.keys(CITY_COORDS).find((k) => k.startsWith(city));
    if (match) return CITY_COORDS[match];
  }
  if (state) {
    const uf = state.trim().toUpperCase();
    if (UF_COORDS[uf]) return UF_COORDS[uf];
  }
  return null;
}

// ─── Types ──────────────────────────────────────────────────────────────────

type MarkerType = "event" | "weather" | "news" | "rj";

type MapMarker = {
  id: string;
  type: MarkerType;
  lat: number;
  lng: number;
  title: string;
  subtitle: string;
  url?: string;
  extra?: React.ReactNode;
  uf?: string;
  date?: string;
};

const LAYER_META: Record<MarkerType, { label: string; labelEn: string; color: string }> = {
  event:    { label: "Eventos",  labelEn: "Events",   color: "#5B7A2F" },
  weather:  { label: "Clima / Alertas", labelEn: "Weather / Alerts", color: "#1565C0" },
  news:     { label: "Notícias", labelEn: "News",     color: "#E8722A" },
  rj:       { label: "Recup. Judicial", labelEn: "Distress", color: "#C62828" },
};

// ─── Component ──────────────────────────────────────────────────────────────

export function DashboardMap({ lang }: { lang: Lang }) {
  // Filter state
  const [ufFilter, setUfFilter] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [showEvents, setShowEvents] = useState(true);
  const [showWeather, setShowWeather] = useState(true);
  const [showNews, setShowNews] = useState(true);
  const [showRJ, setShowRJ] = useState(true);
  const [eventTimeFilter, setEventTimeFilter] = useState<number | null>(30); // days
  const [mapTypeId, setMapTypeId] = useState<"terrain" | "satellite">("terrain");

  // Data state
  const [allEvents, setAllEvents] = useState<MapMarker[]>([]);
  const [allWeather, setAllWeather] = useState<MapMarker[]>([]);
  const [allNews, setAllNews] = useState<MapMarker[]>([]);
  const [activeRJ, setActiveRJ] = useState<MapMarker[]>([]);

  const [allCities, setAllCities] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [bbox, setBbox] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  const [bboxDirty, setBboxDirty] = useState(false); // true when user panned but hasn't clicked "search this area"

  const MAP_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  // Fetch data on mount
  useEffect(() => {
    // Events — Phase 23B: read from /api/events-db (the unified Supabase
    // events table with multi-source data). Prefer the row's own latitude
    // and longitude (populated by src/scripts/geocode-events.js); fall
    // back to the hardcoded resolveCoords() city dictionary only when
    // the row hasn't been geocoded yet.
    fetch("/api/events-db").then(r => r.json()).then(json => {
      if (!json.success || !json.data) return;
      const now = new Date();
      const markers: MapMarker[] = [];
      for (const ev of json.data) {
        if (ev.formato === "Online") continue;
        const evDate = ev.dataInicio || "";
        // Only upcoming events
        if (evDate && new Date(evDate) < now) continue;

        // Prefer pre-geocoded coordinates from the events table
        let lat: number | null = null;
        let lng: number | null = null;
        if (typeof ev.latitude === "number" && typeof ev.longitude === "number") {
          lat = ev.latitude;
          lng = ev.longitude;
        } else if (ev.cidade || ev.estado) {
          const coords = resolveCoords(ev.cidade, ev.estado);
          if (coords) { lat = coords.lat; lng = coords.lng; }
        }
        if (lat == null || lng == null) continue;

        markers.push({
          id: `ev-${ev.id}`,
          type: "event",
          // Tiny jitter so co-located events don't fully overlap
          lat: lat + (Math.random() - 0.5) * 0.01,
          lng: lng + (Math.random() - 0.5) * 0.01,
          title: ev.nome,
          subtitle: [ev.cidade, ev.estado].filter(Boolean).join(", "),
          url: ev.website || ev.source_url || (ev.slug ? `https://agroagenda.agr.br/event/${ev.slug}` : undefined),
          uf: ev.estado || "",
          date: evDate,
          extra: (
            <div className="mt-1 space-y-0.5">
              <p className="text-[11px] text-neutral-500">{evDate}</p>
              <div className="flex items-center gap-1">
                {ev.tipo && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary">{ev.tipo}</span>}
                {ev.source_name && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 uppercase">{ev.source_name}</span>}
              </div>
            </div>
          ),
        });
      }
      // Sort by date, nearest first
      markers.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      setAllEvents(markers);
    }).catch(() => {});

    // Weather — show all stations as alerts (precip > 0mm or notable temp)
    fetch("/api/agroapi/clima").then(r => r.json()).then(json => {
      if (!json.success || !json.data) return;
      const markers: MapMarker[] = [];
      for (const w of json.data) {
        if (w.tempMax === null && w.precip === null) continue; // skip empty data
        const precipLabel = w.precip !== null ? `${w.precip} mm` : "";
        const tempLabel = w.tempMax !== null && w.tempMin !== null ? `${w.tempMin}°–${w.tempMax}°C` : "";
        markers.push({
          id: `wx-${w.id}`,
          type: "weather",
          lat: w.lat,
          lng: w.lng,
          title: `${w.name}, ${w.state}`,
          subtitle: [tempLabel, precipLabel].filter(Boolean).join(" | "),
          uf: w.state || "",
          extra: (
            <div className="mt-1 flex items-center gap-3 text-[11px]">
              {w.tempMax !== null && (
                <span className="flex items-center gap-0.5 text-orange-600"><Thermometer size={11} /> {w.tempMin}°–{w.tempMax}°C</span>
              )}
              {w.precip !== null && w.precip > 0 && (
                <span className="flex items-center gap-0.5 text-blue-600"><CloudRain size={11} /> {w.precip} mm</span>
              )}
            </div>
          ),
        });
      }
      setAllWeather(markers);
    }).catch(() => {});

    // All unique cities from retailer_locations (for city search and parsing)
    supabase
      .from("retailer_locations")
      .select("municipio, uf, latitude, longitude")
      .not("municipio", "is", null)
      .not("latitude", "is", null)
      .then(({ data }) => {
        if (!data) return;
        const seen = new Map<string, { label: string; lat: number; lng: number }>();
        for (const r of data) {
          const key = `${r.municipio}, ${r.uf}`.toLowerCase();
          if (!seen.has(key)) {
            seen.set(key, { label: `${r.municipio}, ${r.uf}`, lat: Number(r.latitude), lng: Number(r.longitude) });
          }
        }
        const cityList = [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
        setAllCities(cityList);

        // Once cities are loaded, parse news and RJ
        // 1. News
        supabase.from("agro_news").select("*").order("published_at", { ascending: false }).limit(50).then(({ data: newsData }) => {
          if (!newsData) return;
          const newsMarkers: MapMarker[] = [];
          for (const n of newsData) {
            let coords = null;
            let finalLoc = "";

            // Strategy A: Direct Tag / Label (if we had it)
            // Strategy B: Search title/summary for city names
            const text = `${n.title} ${n.summary || ""}`;
            for (const c of cityList) {
              if (text.toLowerCase().includes(c.label.toLowerCase().split(",")[0].trim())) {
                coords = { lat: c.lat, lng: c.lng };
                finalLoc = c.label;
                break;
              }
            }

            // Strategy C: State lookup (MT, MS, SP, etc.)
            if (!coords) {
              for (const [uf, c] of Object.entries(UF_COORDS)) {
                if (text.includes(` ${uf}`) || text.includes(` em ${uf}`) || text.includes(` no ${uf}`) || text.includes(` na ${uf}`)) {
                  coords = c;
                  finalLoc = uf;
                  break;
                }
              }
            }

            if (coords) {
              newsMarkers.push({
                id: `nw-${n.id}`,
                type: "news",
                lat: coords.lat + (Math.random() - 0.5) * 0.05,
                lng: coords.lng + (Math.random() - 0.5) * 0.05,
                title: n.title,
                subtitle: n.source_name || "News",
                url: n.source_url,
                uf: finalLoc.includes(",") ? finalLoc.split(",")[1].trim() : finalLoc,
                extra: <div className="text-[11px] text-neutral-500 mt-1">{new Date(n.published_at).toLocaleDateString()}</div>
              });
            }
          }
          setAllNews(newsMarkers);
        });

        // 2. RJ Data
        supabase.from("recuperacao_judicial").select("*").order("filing_date", { ascending: false }).limit(30).then(({ data: rjData }) => {
          if (!rjData) return;
          const rjMarkers: MapMarker[] = [];
          for (const rj of rjData) {
            const coords = UF_COORDS[rj.state?.toUpperCase() || ""];
            if (coords) {
              rjMarkers.push({
                id: `rj-${rj.id}`,
                type: "rj",
                lat: coords.lat + (Math.random() - 0.5) * 0.2, // Spread more for states
                lng: coords.lng + (Math.random() - 0.5) * 0.2,
                title: rj.entity_name,
                subtitle: `${rj.court || "Justiça"} | ${rj.state}`,
                uf: rj.state,
                extra: (
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-error font-bold">{rj.status === "em_andamento" ? "Em Aberto" : rj.status}</span>
                      <span className="text-neutral-500">{rj.filing_date}</span>
                    </div>
                    {rj.debt_value && (
                      <p className="text-[12px] font-bold text-neutral-900">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(rj.debt_value)}
                      </p>
                    )}
                  </div>
                )
              });
            }
          }
          setActiveRJ(rjMarkers);
        });
      });
  }, []);

  // Apply filters
  const filteredMarkers = useMemo(() => {
    let markers: MapMarker[] = [];
    if (showEvents) {
      let events = allEvents;
      if (eventTimeFilter) {
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + eventTimeFilter);
        events = events.filter(m => m.date && new Date(m.date) <= horizon);
      }
      markers = markers.concat(events);
    }
    if (showWeather) markers = markers.concat(allWeather);
    if (showNews) markers = markers.concat(allNews);
    if (showRJ) markers = markers.concat(activeRJ);

    if (ufFilter) markers = markers.filter(m => m.uf?.toUpperCase().trim() === ufFilter.toUpperCase().trim());
    if (citySearch.trim()) {
      const q = citySearch.trim().toLowerCase();
      markers = markers.filter(m =>
        m.subtitle.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        (m.uf || "").toLowerCase().includes(q)
      );
    }

    // Bbox filter (when user clicked "Buscar nesta área")
    if (bbox) {
      markers = markers.filter(m =>
        m.lat >= bbox.south && m.lat <= bbox.north &&
        m.lng >= bbox.west && m.lng <= bbox.east
      );
    }

    return markers;
  }, [showEvents, showWeather, ufFilter, citySearch, allEvents, allWeather, bbox]);

  const activeMarker = filteredMarkers.find(m => m.id === activeMarkerId);

  // Counts per type
  const counts = {
    event: filteredMarkers.filter(m => m.type === "event").length,
    weather: filteredMarkers.filter(m => m.type === "weather").length,
    news: filteredMarkers.filter(m => m.type === "news").length,
    rj: filteredMarkers.filter(m => m.type === "rj").length,
  };

  // Map center — zoom to selected city, filtered region, or default
  const { mapCenter, mapZoom } = useMemo(() => {
    // If a city is selected, zoom to it regardless of markers
    if (citySearch) {
      const fromDb = allCities.find(c => c.label.toLowerCase() === citySearch.toLowerCase());
      if (fromDb) return { mapCenter: { lat: fromDb.lat, lng: fromDb.lng }, mapZoom: 10 };
      const coords = CITY_COORDS[citySearch] || resolveCoords(citySearch.split(",")[0]?.trim(), citySearch.split(",")[1]?.trim());
      if (coords) return { mapCenter: coords, mapZoom: 10 };
    }
    // If filtered markers exist, fit them
    if (filteredMarkers.length > 0 && filteredMarkers.length <= 20 && (ufFilter || citySearch)) {
      const lats = filteredMarkers.map(m => m.lat);
      const lngs = filteredMarkers.map(m => m.lng);
      const center = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
      const latSpan = Math.max(...lats) - Math.min(...lats);
      const zoom = latSpan < 1 ? 9 : latSpan < 3 ? 7 : latSpan < 8 ? 5 : 4;
      return { mapCenter: center, mapZoom: zoom };
    }
    if (ufFilter && UF_COORDS[ufFilter]) return { mapCenter: UF_COORDS[ufFilter], mapZoom: 6 };
    return { mapCenter: { lat: -15.78, lng: -47.93 }, mapZoom: 4 };
  }, [ufFilter, citySearch, filteredMarkers, allCities]);

  // Build unique city list from all sources for autocomplete
  const availableCities = useMemo(() => {
    const cities = new Map<string, { label: string; type: string }>();
    // Cities from events (priority — tagged as "evento")
    for (const m of allEvents) {
      if (m.subtitle) cities.set(m.subtitle.toLowerCase(), { label: m.subtitle, type: "evento" });
    }
    // Cities from weather stations
    for (const m of allWeather) {
      if (m.title) cities.set(m.title.toLowerCase(), { label: m.title, type: "clima" });
    }
    // All cities from retailer_locations in Supabase
    for (const c of allCities) {
      const k = c.label.toLowerCase();
      if (!cities.has(k)) cities.set(k, { label: c.label, type: "" });
    }
    return [...cities.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [allEvents, allWeather, allCities]);

  // Autocomplete state
  const [cityQuery, setCityQuery] = useState("");
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const cityRef = React.useRef<HTMLDivElement>(null);

  const citySuggestions = useMemo(() => {
    if (!cityQuery.trim()) return availableCities.slice(0, 15);
    const q = cityQuery.trim().toLowerCase();
    return availableCities.filter(c => c.label.toLowerCase().includes(q)).slice(0, 10);
  }, [cityQuery, availableCities]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!cityDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) setCityDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [cityDropdownOpen]);

  const selectCity = (label: string) => { setCitySearch(label); setCityQuery(""); setCityDropdownOpen(false); };
  const clearCity = () => { setCitySearch(""); setCityQuery(""); };
  const clearFilters = () => { setUfFilter(""); clearCity(); };
  const hasFilters = ufFilter || citySearch;

  return (
    <div>
      {/* ── Filter Panel (outside map) ── */}
      <div className="px-4 py-3 border-b border-neutral-200 bg-white">
        <div className="flex flex-wrap items-center gap-3">
          {/* Layer toggles */}
          <div className="flex items-center gap-1.5">
            <LayerToggle active={showEvents} onClick={() => setShowEvents(!showEvents)}
              color={LAYER_META.event.color} label={lang === "pt" ? "Eventos" : "Events"} count={counts.event} />
            <LayerToggle active={showWeather} onClick={() => setShowWeather(!showWeather)}
              color={LAYER_META.weather.color} label={lang === "pt" ? "Clima" : "Weather"} count={counts.weather} />
            <LayerToggle active={showNews} onClick={() => setShowNews(!showNews)}
              color={LAYER_META.news.color} label={lang === "pt" ? "Notícias" : "News"} count={counts.news} />
            <LayerToggle active={showRJ} onClick={() => setShowRJ(!showRJ)}
              color={LAYER_META.rj.color} label={lang === "pt" ? "Alertas RJ" : "Distress"} count={counts.rj} />
          </div>

          <div className="h-5 w-px bg-neutral-200 hidden sm:block" />

          {/* UF filter */}
          <select value={ufFilter} onChange={e => setUfFilter(e.target.value)}
            className="px-2 py-1 bg-neutral-50 border border-neutral-200 rounded text-[11px] h-7 focus:outline-none focus:ring-1 focus:ring-brand-primary/30">
            <option value="">{lang === "pt" ? "Todos os estados" : "All states"}</option>
            {ALL_UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </select>

          {/* City autocomplete search */}
          {citySearch ? (
            /* Selected city chip */
            <div className="flex items-center gap-1.5 px-2 py-1 bg-brand-surface border border-brand-light rounded text-[11px] h-7 font-medium text-brand-primary">
              <MapPin size={10} />
              {citySearch}
              <button onClick={clearCity} className="ml-0.5 text-brand-primary/60 hover:text-brand-primary"><X size={10} /></button>
            </div>
          ) : (
            /* Search input with dropdown */
            <div className="relative" ref={cityRef}>
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input type="text" value={cityQuery}
                onChange={e => { setCityQuery(e.target.value); setCityDropdownOpen(true); }}
                onFocus={() => setCityDropdownOpen(true)}
                placeholder={lang === "pt" ? "Buscar cidade..." : "Search city..."}
                className="pl-7 pr-3 py-1 w-44 bg-neutral-50 border border-neutral-200 rounded text-[11px] h-7 focus:outline-none focus:ring-1 focus:ring-brand-primary/30" />
              {cityDropdownOpen && citySuggestions.length > 0 && (
                <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg border border-neutral-200 shadow-lg z-50 max-h-52 overflow-y-auto">
                  {citySuggestions.map((c, i) => (
                    <button key={i} onClick={() => selectCity(c.label)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-neutral-50 transition-colors border-b border-neutral-50 last:border-0">
                      <MapPin size={11} className="text-neutral-400 shrink-0" />
                      <span className="text-neutral-800">{c.label}</span>
                      {c.type && <span className="ml-auto text-[9px] text-neutral-400 uppercase">{c.type}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-4">
            {showEvents && (
              <div className="flex items-center gap-1 bg-neutral-100 p-0.5 rounded text-[9px]">
                {[30, 90].map(d => (
                  <button key={d} onClick={() => setEventTimeFilter(d)}
                    className={`px-1.5 py-0.5 rounded transition-all ${eventTimeFilter === d ? "bg-white shadow-sm text-brand-primary font-bold" : "text-neutral-500 hover:text-neutral-700"}`}>
                    {d}d
                  </button>
                ))}
                <button onClick={() => setEventTimeFilter(null)}
                   className={`px-1.5 py-0.5 rounded transition-all ${eventTimeFilter === null ? "bg-white shadow-sm text-brand-primary font-bold" : "text-neutral-500 hover:text-neutral-700"}`}>
                   {lang === 'pt' ? 'Tudo' : 'All'}
                </button>
              </div>
            )}
            <div className="text-[11px] text-neutral-400">
              {filteredMarkers.length} {lang === "pt" ? "pontos" : "points"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Map ── */}
      <div id="dashboard-map-container" className="relative w-full h-[380px] bg-neutral-100">
        {MAP_KEY ? (
          <APIProvider apiKey={MAP_KEY}>
            <GMap
              defaultCenter={mapCenter}
              defaultZoom={mapZoom}
              key={`${mapCenter.lat}-${mapCenter.lng}-${mapZoom}`}
              mapId="dashboard-intel-map"
              disableDefaultUI={true}
              zoomControl={true}
              mapTypeControl={false}
              mapTypeId={mapTypeId}
              streetViewControl={false}
              fullscreenControl={false}
              rotateControl={false}
              onCameraChanged={() => { if (!bboxDirty) setBboxDirty(true); }}
            >
              {filteredMarkers.map(m => (
                <AdvancedMarker key={m.id} position={{ lat: m.lat, lng: m.lng }}
                  onClick={() => setActiveMarkerId(m.id)}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white border-2 border-white shadow-md cursor-pointer transition-transform hover:scale-125"
                    style={{ backgroundColor: LAYER_META[m.type]?.color || "#5B7A2F" }}>
                    {m.type === "event" && <Calendar size={13} />}
                    {m.type === "weather" && <CloudRain size={13} />}
                    {m.type === "news" && <Newspaper size={13} />}
                    {m.type === "rj" && <Gavel size={13} />}
                  </div>
                </AdvancedMarker>
              ))}

              {activeMarker && (
                <InfoWindow position={{ lat: activeMarker.lat, lng: activeMarker.lng }}
                  onCloseClick={() => setActiveMarkerId(null)} pixelOffset={[0, -10]}>
                  <div className="p-1 max-w-[240px]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: LAYER_META[activeMarker.type]?.color }} />
                      <span className="text-[10px] font-semibold text-neutral-500 uppercase">
                        {lang === "pt" ? LAYER_META[activeMarker.type]?.label : LAYER_META[activeMarker.type]?.labelEn}
                      </span>
                    </div>
                    <h4 className="font-semibold text-neutral-900 text-[13px] leading-tight mb-0.5">{activeMarker.title}</h4>
                    <p className="text-[12px] text-neutral-600">{activeMarker.subtitle}</p>
                    {activeMarker.extra}
                    {activeMarker.url && (
                      <a href={activeMarker.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-medium text-brand-primary hover:underline">
                        {lang === "pt" ? "Ver detalhes" : "Details"} <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </InfoWindow>
              )}

              {/* Custom Map Type Toggle (Small) */}
              <div className="absolute top-3 left-3 flex bg-white/90 backdrop-blur-sm rounded border border-neutral-200 overflow-hidden shadow-md z-10 transition-all hover:bg-white">
                <button
                  onClick={() => setMapTypeId("terrain")}
                  className={`px-2 py-1 text-[10px] font-bold transition-all ${mapTypeId === "terrain" ? "bg-brand-primary text-white" : "text-neutral-500 hover:text-neutral-700"}`}>
                  Map
                </button>
                <div className="w-[1px] bg-neutral-200" />
                <button
                  onClick={() => setMapTypeId("satellite")}
                  className={`px-2 py-1 text-[10px] font-bold transition-all ${mapTypeId === "satellite" ? "bg-brand-primary text-white" : "text-neutral-500 hover:text-neutral-700"}`}>
                  Satellite
                </button>
              </div>

              {/* Benchmark Controls (Top Right) */}
              <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
                <button
                  onClick={() => {
                    const el = document.getElementById("dashboard-map-container");
                    if (el?.requestFullscreen) el.requestFullscreen();
                  }}
                  className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded border border-neutral-200 flex items-center justify-center text-neutral-600 shadow-md hover:bg-white hover:text-brand-primary transition-all"
                  title={lang === "pt" ? "Tela Cheia" : "Fullscreen"}>
                  <Maximize size={15} />
                </button>
                <button
                  onClick={() => {
                    setUfFilter("");
                    setCitySearch("");
                    setCityQuery("");
                    setBbox(null);
                    setBboxDirty(false);
                  }}
                  className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded border border-neutral-200 flex items-center justify-center text-neutral-600 shadow-md hover:bg-white hover:text-brand-primary transition-all"
                  title={lang === "pt" ? "Recentrar" : "Recenter"}>
                  <Home size={15} />
                </button>
              </div>

              <BboxCaptureButton lang={lang} bboxDirty={bboxDirty} bboxActive={!!bbox}
                onApply={(b) => { setBbox(b); setBboxDirty(false); }}
                onClear={() => { setBbox(null); setBboxDirty(false); }} />
            </GMap>
          </APIProvider>
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
            Google Maps API key not configured.
          </div>
        )}
      </div>

      {/* ── Highlights strip below map ── */}
      {allEvents.length > 0 && (
        <div className="px-4 py-3 border-t border-neutral-200 bg-neutral-50">
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            {lang === "pt" ? "Próximos Eventos" : "Upcoming Events"}
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {allEvents.slice(0, 6).map(ev => (
              <a key={ev.id} href={ev.url} target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 bg-white rounded-md border border-neutral-200 px-3 py-2 hover:border-brand-primary transition-colors group w-52">
                <p className="text-[11px] font-semibold text-neutral-900 leading-snug line-clamp-2 group-hover:text-brand-primary">{ev.title}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <MapPin size={9} />{ev.subtitle}
                  </span>
                  <span className="text-[10px] text-neutral-400">{ev.date?.slice(0, 10)}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Layer Toggle Button ────────────────────────────────────────────────────

function LayerToggle({ active, onClick, color, label, count }: {
  active: boolean; onClick: () => void; color: string; label: string; count: number;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] h-7 font-semibold transition-all border ${
        active ? "border-neutral-300 bg-white shadow-sm" : "border-transparent bg-neutral-50 text-neutral-400"
      }`}>
      {active ? <Eye size={11} style={{ color }} /> : <EyeOff size={11} />}
      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active ? color : "#D1D5DB" }} />
      <span className={active ? "text-neutral-800" : ""}>{label}</span>
      <span className={`text-[9px] ${active ? "text-neutral-400" : "text-neutral-300"}`}>({count})</span>
    </button>
  );
}

// ─── Bbox "Search this area" button (must be inside APIProvider) ────────────

function BboxCaptureButton({ lang, bboxDirty, bboxActive, onApply, onClear }: {
  lang: Lang; bboxDirty: boolean; bboxActive: boolean;
  onApply: (bbox: { north: number; south: number; east: number; west: number }) => void;
  onClear: () => void;
}) {
  const map = useMap();

  const handleApply = useCallback(() => {
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    onApply({ north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() });
  }, [map, onApply]);

  return (
    <>
      {/* "Search this area" button — appears when user pans */}
      {bboxDirty && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <button onClick={handleApply}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full shadow-lg border border-neutral-200 text-[11px] font-bold text-neutral-700 hover:bg-white hover:border-brand-primary transition-all">
            <RefreshCw size={11} className="text-brand-primary" />
            {lang === "pt" ? "Buscar nesta área" : "Search this area"}
          </button>
        </div>
      )}
      {/* Active bbox indicator */}
      {bboxActive && !bboxDirty && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-surface rounded-full border border-brand-light text-[11px] font-medium text-brand-primary">
            <MapPin size={11} />
            {lang === "pt" ? "Filtrado por área visível" : "Filtered by visible area"}
            <button onClick={onClear} className="ml-1 hover:text-error transition-colors"><X size={12} /></button>
          </div>
        </div>
      )}
    </>
  );
}
