"use client";

/**
 * FuturesCurve — forward curve panel for a commodity.
 *
 * Two backends, one UI:
 *   - etanol / acucar          → /api/futures-na     (B3 ETH, ICE NY11 — no Yahoo coverage)
 *   - soja / milho / cafe / …  → /api/intl-futures/curve (Yahoo CME contract months)
 *
 * The curve plots **price (line) vs expiry date (X-axis)** plus a
 * **traded volume bar** behind each contract, so the user sees the
 * shape of the term structure AND which expiries are liquid in one
 * glance. Back-month contracts with zero volume are dropped on the
 * server; the user can flip a toggle to include them.
 *
 * The component is intentionally self-contained — drop into any
 * commodity panel and it figures out which endpoint to hit.
 */

import { useEffect, useMemo, useState } from "react";
import { Lang } from "@/lib/i18n";
import { Loader2, AlertTriangle, ExternalLink, TrendingUp, TrendingDown, Minus, BarChart3, Calendar } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";

interface Contract {
  label: string;
  code?: string;
  expiry_month: number;
  expiry_year: number;
  expiry_date: string;
  close?: number;       // NA backend
  last?: number | null; // Yahoo backend
  change_pct: number | null;
  volume?: number | null;
  open_interest?: number | null;
}

interface CurveResponse {
  success: boolean;
  slug: string;
  name: string;
  source: string;
  exchange: string;
  unit: string;
  asOf?: string | null;       // NA only
  fetched_at?: string;        // Yahoo only
  source_url?: string;        // NA only
  contracts: Contract[];
  error?: string;
}

const NA_SLUGS = new Set(["etanol", "acucar"]);

function endpointFor(slug: string): string {
  if (NA_SLUGS.has(slug)) return `/api/futures-na?slug=${slug}`;
  return `/api/intl-futures/curve?slug=${slug}`;
}

function priceOf(c: Contract): number | null {
  return c.close ?? c.last ?? null;
}

export function FuturesCurve({ slug, lang }: { slug: string; lang: Lang }) {
  const [data, setData] = useState<CurveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const url = endpointFor(slug) + (showAll && !NA_SLUGS.has(slug) ? "&include_illiquid=true" : "");
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.success || (d.contracts && d.contracts.length > 0)) setData(d);
        else setErr(d.error || "Sem dados");
      })
      .catch((e) => !cancelled && setErr(e.message || "Falha ao carregar"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [slug, showAll]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.contracts
      .map((c) => {
        const price = priceOf(c);
        if (price == null) return null;
        return {
          label: c.label,
          expiry_date: c.expiry_date,
          price,
          volume: c.volume ?? 0,
          change_pct: c.change_pct,
        };
      })
      .filter((x): x is { label: string; expiry_date: string; price: number; volume: number; change_pct: number | null } => x != null);
  }, [data]);

  const front = chartData[0];
  const back = chartData[chartData.length - 1];
  const totalVolume = chartData.reduce((s, c) => s + (c.volume || 0), 0);
  // Contango (back > front) vs backwardation (front > back) — useful at-a-glance read.
  const structure: "contango" | "backwardation" | "flat" | null =
    front && back && front !== back
      ? back.price > front.price * 1.005 ? "contango"
        : back.price < front.price * 0.995 ? "backwardation"
        : "flat"
      : null;

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 p-6 flex items-center justify-center min-h-[200px]">
        <Loader2 size={20} className="animate-spin text-neutral-400" />
      </div>
    );
  }

  if (err || !data || chartData.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 p-6">
        <div className="flex items-center gap-2 text-[12px] text-neutral-500">
          <AlertTriangle size={13} />
          {lang === "pt" ? "Curva de futuros indisponível." : "Futures curve unavailable."}
          {err && <span className="text-neutral-400">— {err}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-200 flex items-start justify-between gap-3 flex-wrap bg-neutral-50/60">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <BarChart3 size={13} className="text-purple-600" />
            <h4 className="text-[13px] font-bold text-neutral-900">
              {lang === "pt" ? "Curva de Futuros" : "Futures Curve"}
            </h4>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 uppercase">
              {data.exchange}
            </span>
          </div>
          <p className="text-[11px] text-neutral-500">
            {data.name} · {data.unit}
            {data.asOf && (
              <> · <span className="text-neutral-700">{lang === "pt" ? "Fechamento" : "Close"} {data.asOf}</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-neutral-500 flex-wrap">
          {structure && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold ${
              structure === "contango"     ? "bg-amber-50 text-amber-800 border border-amber-200" :
              structure === "backwardation" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" :
                                              "bg-neutral-100 text-neutral-700 border border-neutral-200"
            }`}>
              {structure === "contango" && <TrendingUp size={11} />}
              {structure === "backwardation" && <TrendingDown size={11} />}
              {structure === "flat" && <Minus size={11} />}
              {structure === "contango" ? "Contango" : structure === "backwardation" ? "Backwardation" : "Flat"}
            </span>
          )}
          <span>
            {chartData.length} {lang === "pt" ? "vencimentos" : "expiries"}
          </span>
          {totalVolume > 0 && (
            <span>
              {lang === "pt" ? "Vol total" : "Total vol"}:{" "}
              <b className="text-neutral-900">{totalVolume.toLocaleString(lang === "pt" ? "pt-BR" : "en-US")}</b>
            </span>
          )}
          {!NA_SLUGS.has(slug) && (
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="scale-90"
              />
              {lang === "pt" ? "Incluir ilíquidos" : "Include illiquid"}
            </label>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="h-[260px] p-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" vertical={false} />
            <XAxis
              dataKey="expiry_date"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickFormatter={(d) => {
                const date = new Date(d + "T12:00:00");
                return date.toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { month: "short", year: "2-digit" });
              }}
              minTickGap={20}
            />
            <YAxis
              yAxisId="price"
              orientation="left"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              domain={["auto", "auto"]}
              tickFormatter={(v) => Number(v).toFixed(0)}
            />
            <YAxis
              yAxisId="vol"
              orientation="right"
              tick={{ fontSize: 9, fill: "#cbd5e1" }}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              hide={chartData.every((c) => c.volume === 0)}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e5e0" }}
              labelFormatter={(d) => {
                const date = new Date(d + "T12:00:00");
                return date.toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { month: "long", year: "numeric" });
              }}
              formatter={(value: any, name: any) => {
                const key = String(name);
                if (key === "price") return [`${Number(value).toFixed(2)} ${data.unit}`, lang === "pt" ? "Preço" : "Price"];
                if (key === "volume") return [Number(value).toLocaleString(lang === "pt" ? "pt-BR" : "en-US"), lang === "pt" ? "Volume" : "Volume"];
                return [value, key];
              }}
            />
            <Bar yAxisId="vol" dataKey="volume" fill="#e2e8f0" radius={[3, 3, 0, 0]} />
            {front && (
              <ReferenceLine
                yAxisId="price"
                y={front.price}
                stroke="#94a3b8"
                strokeDasharray="2 4"
                ifOverflow="extendDomain"
                label={{ value: lang === "pt" ? "Front-month" : "Front-month", position: "insideTopLeft", fontSize: 9, fill: "#64748b" }}
              />
            )}
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="price"
              stroke="#5B7A2F"
              strokeWidth={2}
              dot={{ r: 4, fill: "#5B7A2F" }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="border-t border-neutral-200 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-neutral-50 text-neutral-500 text-left uppercase font-semibold tracking-wider text-[9px]">
            <tr>
              <th className="px-3 py-2"><Calendar size={10} className="inline mr-1" />{lang === "pt" ? "Vencimento" : "Expiry"}</th>
              <th className="px-3 py-2 text-right">{lang === "pt" ? "Preço" : "Price"}</th>
              <th className="px-3 py-2 text-right">{lang === "pt" ? "Var %" : "Chg %"}</th>
              <th className="px-3 py-2 text-right">{lang === "pt" ? "Volume" : "Volume"}</th>
              <th className="px-3 py-2 text-right">{lang === "pt" ? "Spread vs front" : "Spread vs front"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {chartData.map((c, i) => {
              const isFront = i === 0;
              const spread = front && !isFront ? c.price - front.price : null;
              const spreadPct = spread != null && front && front.price !== 0 ? (spread / front.price) * 100 : null;
              return (
                <tr key={c.label} className={isFront ? "bg-purple-50/50" : ""}>
                  <td className="px-3 py-1.5 font-semibold text-neutral-900">
                    {c.label}
                    {isFront && (
                      <span className="ml-1.5 text-[8px] font-bold px-1 py-0.5 rounded bg-purple-600 text-white uppercase">
                        Front
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-neutral-900">
                    {c.price.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono ${
                    c.change_pct == null ? "text-neutral-400" :
                    c.change_pct > 0 ? "text-emerald-600" :
                    c.change_pct < 0 ? "text-rose-600" : "text-neutral-500"
                  }`}>
                    {c.change_pct == null ? "—" : `${c.change_pct >= 0 ? "+" : ""}${c.change_pct.toFixed(2)}%`}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-neutral-600">
                    {c.volume > 0 ? c.volume.toLocaleString(lang === "pt" ? "pt-BR" : "en-US") : "—"}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono ${
                    spread == null ? "text-neutral-400" :
                    spread > 0 ? "text-amber-700" :
                    spread < 0 ? "text-emerald-700" : "text-neutral-500"
                  }`}>
                    {spread == null ? "—" : (
                      <>
                        {spread >= 0 ? "+" : ""}{spread.toFixed(2)}
                        {spreadPct != null && (
                          <span className="text-[9px] text-neutral-400 ml-1">({spreadPct >= 0 ? "+" : ""}{spreadPct.toFixed(1)}%)</span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer source */}
      <div className="px-4 py-2 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400">
        <span>
          {lang === "pt" ? "Fonte:" : "Source:"} {data.source}
        </span>
        {data.source_url && (
          <a href={data.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-neutral-700">
            <ExternalLink size={9} />
            {lang === "pt" ? "Ver na fonte" : "View source"}
          </a>
        )}
      </div>
    </div>
  );
}
