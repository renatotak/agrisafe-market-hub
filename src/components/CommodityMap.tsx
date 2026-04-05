"use client";

import { useState, useEffect } from "react";
import { APIProvider, Map as GMap, AdvancedMarker, InfoWindow } from "@vis.gl/react-google-maps";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";

interface RegionalPrice {
  praca: string;
  city: string;
  uf: string;
  cooperative: string;
  price: number | null;
  price_label: string;
  variation: number | null;
  variation_label: string;
  direction: "up" | "down" | "stable";
  lat: number | null;
  lng: number | null;
}

const COMMODITY_TABS = [
  { slug: "soja", label: "Soja", en: "Soybean", color: "#5B7A2F" },
  { slug: "milho", label: "Milho", en: "Corn", color: "#E8722A" },
  { slug: "cafe", label: "Café", en: "Coffee", color: "#6F4E37" },
  { slug: "boi-gordo", label: "Boi Gordo", en: "Cattle", color: "#8B4513" },
  { slug: "trigo", label: "Trigo", en: "Wheat", color: "#DAA520" },
  { slug: "algodao", label: "Algodão", en: "Cotton", color: "#7FA02B" },
];

function priceColor(price: number | null, prices: RegionalPrice[]): string {
  if (price === null) return "#9E9E9E";
  const validPrices = prices.filter(p => p.price !== null).map(p => p.price!);
  if (validPrices.length < 2) return "#5B7A2F";
  const min = Math.min(...validPrices);
  const max = Math.max(...validPrices);
  const range = max - min || 1;
  const ratio = (price - min) / range; // 0 = cheapest, 1 = most expensive
  // Green (cheap) → Yellow → Red (expensive)
  if (ratio < 0.5) {
    const r = Math.round(91 + (ratio * 2) * 164);
    const g = Math.round(122 - (ratio * 2) * 22);
    return `rgb(${r}, ${g}, 47)`;
  }
  const r = Math.round(255);
  const g = Math.round(200 - ((ratio - 0.5) * 2) * 160);
  return `rgb(${r}, ${g}, 40)`;
}

function MapContent({ slug, lang }: { slug: string; lang: string }) {
  const [data, setData] = useState<RegionalPrice[]>([]);
  const [unit, setUnit] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setActiveId(null);
    fetch(`/api/prices-na/regional?commodity=${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          setData(d.data.filter((p: RegionalPrice) => p.lat !== null && p.price !== null));
          setUnit(d.unit || "");
          setClosingDate(d.closing_date || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const active = data.find((_, i) => `${slug}-${i}` === activeId);
  const activeIdx = active ? data.indexOf(active) : -1;

  // Stats
  const validPrices = data.filter(p => p.price !== null).map(p => p.price!);
  const avgPrice = validPrices.length > 0 ? validPrices.reduce((a, b) => a + b, 0) / validPrices.length : 0;
  const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
  const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : 0;

  return (
    <>
      {/* Stats bar */}
      <div className="px-3 py-2 bg-white border-b border-neutral-200 flex items-center gap-4 text-[11px] flex-wrap">
        {loading ? (
          <Loader2 size={14} className="animate-spin text-neutral-400" />
        ) : (
          <>
            <span className="text-neutral-500">{data.length} {lang === "pt" ? "praças" : "locations"}</span>
            {closingDate && <span className="text-neutral-400">{closingDate}</span>}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-neutral-500">Min: <strong className="text-success-dark">R$ {minPrice.toFixed(2)}</strong></span>
              <span className="text-neutral-500">Média: <strong className="text-neutral-800">R$ {avgPrice.toFixed(2)}</strong></span>
              <span className="text-neutral-500">Max: <strong className="text-error">R$ {maxPrice.toFixed(2)}</strong></span>
            </div>
          </>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative z-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-50/80 z-10">
            <Loader2 size={24} className="animate-spin text-brand-primary" />
          </div>
        )}
        <GMap
          defaultCenter={{ lat: -15.78, lng: -47.93 }}
          defaultZoom={4}
          mapId="commodity-pulse-map"
          style={{ width: "100%", height: "100%" }}
          disableDefaultUI={false}
          zoomControl
          mapTypeControl
          mapTypeId="terrain"
          streetViewControl={false}
          fullscreenControl={false}
          rotateControl={false}
          gestureHandling="cooperative"
        >
          {data.map((p, idx) => (
            <AdvancedMarker key={`${slug}-${idx}`} position={{ lat: p.lat!, lng: p.lng! }}
              onClick={() => setActiveId(`${slug}-${idx}`)}>
              <div className="relative group cursor-pointer">
                <div className="w-5 h-5 rounded-full border-2 border-white shadow-md transition-transform hover:scale-150"
                  style={{ backgroundColor: priceColor(p.price, data) }} />
                {/* Price label on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-neutral-900 text-white text-[9px] font-mono rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {p.price_label}
                </div>
              </div>
            </AdvancedMarker>
          ))}

          {active && (
            <InfoWindow position={{ lat: active.lat!, lng: active.lng! }}
              onCloseClick={() => setActiveId(null)} pixelOffset={[0, -8]}>
              <div className="p-1.5 min-w-[180px]">
                <h4 className="font-bold text-[13px] text-neutral-900 mb-0.5">{active.city}/{active.uf}</h4>
                {active.cooperative && <p className="text-[10px] text-neutral-500 mb-1.5">{active.cooperative}</p>}
                <div className="flex items-baseline gap-2">
                  <span className="text-[18px] font-bold font-mono" style={{ color: priceColor(active.price, data) }}>
                    R$ {active.price_label}
                  </span>
                  {active.variation !== null && active.variation !== 0 && (
                    <span className={`text-[12px] font-bold flex items-center gap-0.5 ${active.direction === "up" ? "text-green-600" : "text-red-500"}`}>
                      {active.direction === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {active.variation_label}%
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-neutral-400 mt-1">{unit}</p>
              </div>
            </InfoWindow>
          )}
        </GMap>

        {/* Color legend */}
        {!loading && data.length > 0 && (
          <div className="absolute bottom-3 left-3 z-10 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border border-neutral-200">
            <p className="text-[9px] font-semibold text-neutral-500 uppercase mb-1">{unit}</p>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-success-dark font-mono">{minPrice.toFixed(0)}</span>
              <div className="w-24 h-2 rounded-full" style={{ background: "linear-gradient(to right, #5B7A2F, #DAA520, #E53935)" }} />
              <span className="text-[10px] text-error font-mono">{maxPrice.toFixed(0)}</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function CommodityMap({ lang }: { lang: string }) {
  const [selectedSlug, setSelectedSlug] = useState("soja");
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return <div className="p-8 text-center text-neutral-500 bg-neutral-100 rounded-lg h-[500px] flex items-center justify-center border border-neutral-200">
      Google Maps API key not configured.
    </div>;
  }

  return (
    <div className="flex flex-col h-[500px] border border-neutral-200 rounded-lg overflow-hidden bg-white shadow-sm">
      {/* Commodity tabs */}
      <div className="p-3 bg-neutral-50 border-b border-neutral-200 flex gap-2 overflow-x-auto shrink-0">
        {COMMODITY_TABS.map(c => (
          <button key={c.slug} onClick={() => setSelectedSlug(c.slug)}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md whitespace-nowrap transition-colors ${
              selectedSlug === c.slug
                ? "text-white shadow-sm"
                : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
            }`}
            style={selectedSlug === c.slug ? { backgroundColor: c.color } : {}}>
            {lang === "pt" ? c.label : c.en}
          </button>
        ))}
      </div>

      <APIProvider apiKey={apiKey}>
        <MapContent slug={selectedSlug} lang={lang} />
      </APIProvider>
    </div>
  );
}
