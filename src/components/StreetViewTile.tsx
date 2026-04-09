"use client";

/**
 * Phase 24G — StreetViewTile.
 *
 * Renders a Google Street View static image for an entity's matriz
 * address. Used by RetailersDirectory and IndustriesDirectory inside
 * the expanded panel.
 *
 * Strategy:
 *   - Prefer lat/lng (Street View metadata API serves the closest pano).
 *   - Fall back to a free-text address string.
 *   - Always probe the metadata endpoint first (cheap, free) to verify
 *     a pano exists at the location BEFORE rendering the static image.
 *     The static image API charges per fetch even if no pano exists,
 *     so an unconditional render would burn quota on rural addresses
 *     that have no Street View coverage (most of MT, GO, BA interior).
 *
 * Key facts:
 *   - Uses NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (already set, used by maps)
 *   - Static API is free for up to 25,000 requests/month
 *   - Metadata API is FREE always, no quota
 *   - Tile renders at 480×280 (matches the data tiles in the panel)
 */

import { useEffect, useState } from "react";
import { Eye, EyeOff, ExternalLink, Loader2 } from "lucide-react";

interface Props {
  /** Latitude (preferred over address). */
  latitude?: number | null;
  /** Longitude (preferred over address). */
  longitude?: number | null;
  /** Full address string (used when lat/lng missing). */
  address?: string | null;
  /** Display label / context shown above the tile. */
  label?: string;
  lang: "pt" | "en";
}

const STATIC_API = "https://maps.googleapis.com/maps/api/streetview";
const META_API = "https://maps.googleapis.com/maps/api/streetview/metadata";
const SIZE = "480x260";
const FOV = 80;

export function StreetViewTile({ latitude, longitude, address, label, lang }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const [status, setStatus] = useState<"checking" | "ok" | "no_pano" | "error">("checking");
  const [collapsed, setCollapsed] = useState(false);

  // Build the location query string. Lat/lng takes precedence — it's
  // unambiguous and doesn't burn geocoding quota.
  const locationParam =
    latitude != null && longitude != null
      ? `${latitude},${longitude}`
      : address || "";

  useEffect(() => {
    if (!apiKey || !locationParam) {
      setStatus("error");
      return;
    }
    let cancelled = false;
    setStatus("checking");

    // Metadata probe: free, returns { status: "OK" | "ZERO_RESULTS" | ... }
    const url = `${META_API}?location=${encodeURIComponent(locationParam)}&key=${apiKey}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.status === "OK") setStatus("ok");
        else setStatus("no_pano");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => { cancelled = true; };
  }, [apiKey, locationParam]);

  if (!apiKey) {
    return (
      <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3 text-[11px] text-neutral-500">
        {lang === "pt"
          ? "Google Maps API key não configurada — Street View indisponível."
          : "Google Maps API key not configured — Street View unavailable."}
      </div>
    );
  }

  if (!locationParam) {
    return (
      <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3 text-[11px] text-neutral-500">
        {lang === "pt" ? "Sem coordenadas ou endereço." : "No coordinates or address."}
      </div>
    );
  }

  const staticUrl = `${STATIC_API}?size=${SIZE}&location=${encodeURIComponent(locationParam)}&fov=${FOV}&key=${apiKey}`;

  // Open in Google Maps Street View live mode
  const liveUrl =
    latitude != null && longitude != null
      ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${latitude},${longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationParam)}`;

  return (
    <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-50 border-b border-neutral-200">
        <div className="flex items-center gap-1.5">
          <Eye size={12} className="text-brand-primary" />
          <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
            {lang === "pt" ? "Street View" : "Street View"}
          </span>
          {label && <span className="text-[10px] text-neutral-400">— {label}</span>}
          {status === "ok" && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
              OK
            </span>
          )}
          {status === "no_pano" && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              {lang === "pt" ? "SEM PANO" : "NO PANO"}
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-neutral-400 hover:text-neutral-700 transition-colors"
          title={lang === "pt" ? "Recolher / expandir" : "Toggle"}
        >
          {collapsed ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
      </div>

      {!collapsed && (
        <div className="relative">
          {status === "checking" && (
            <div className="flex items-center justify-center h-[260px] bg-neutral-50">
              <Loader2 size={20} className="animate-spin text-neutral-400" />
            </div>
          )}

          {status === "ok" && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
              title={lang === "pt" ? "Abrir no Google Maps" : "Open in Google Maps"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={staticUrl}
                alt="Street View"
                className="w-full h-[260px] object-cover group-hover:opacity-90 transition-opacity"
                loading="lazy"
              />
              <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded bg-white/90 backdrop-blur-sm text-[10px] font-bold text-brand-primary shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                {lang === "pt" ? "Abrir 360°" : "Open 360°"}
                <ExternalLink size={9} />
              </div>
            </a>
          )}

          {status === "no_pano" && (
            <div className="flex flex-col items-center justify-center h-[140px] bg-amber-50/50 px-4 text-center">
              <p className="text-[11px] text-amber-700 font-medium">
                {lang === "pt"
                  ? "Sem cobertura Street View neste endereço."
                  : "No Street View coverage at this address."}
              </p>
              <p className="text-[10px] text-amber-600 mt-1">
                {lang === "pt"
                  ? "Comum em zonas rurais. Tente o mapa convencional."
                  : "Common in rural areas. Try the regular map."}
              </p>
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-brand-primary hover:underline"
              >
                {lang === "pt" ? "Abrir no Google Maps" : "Open in Google Maps"}
                <ExternalLink size={9} />
              </a>
            </div>
          )}

          {status === "error" && (
            <div className="flex items-center justify-center h-[100px] bg-red-50 text-[11px] text-red-700">
              {lang === "pt" ? "Erro ao consultar Street View" : "Street View metadata error"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
