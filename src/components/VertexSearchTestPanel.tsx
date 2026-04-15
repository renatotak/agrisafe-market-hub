"use client";

import { useState } from "react";
import { Loader2, Search, Sparkles, AlertTriangle } from "lucide-react";
import { Lang } from "@/lib/i18n";

type Hit = {
  id: string | null;
  title: string;
  category: string | null;
  tier: number | null;
  source_url: string | null;
  source_type: string | null;
  snippet: unknown;
  extractive: unknown;
};

type Response = {
  query?: string;
  engine?: string;
  location?: string;
  count?: number;
  summary?: string | null;
  hits?: Hit[];
  error?: string;
};

/**
 * Settings panel that lets the user paste a query and hit the
 * Vertex AI Search datastore (`agsf-knowledge-items`) side-by-side
 * with the existing pgvector RAG, to compare quality before any
 * production migration.
 */
export function VertexSearchTestPanel({ lang }: { lang: Lang }) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!q.trim()) return;
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(
        `/api/knowledge/search-vx?q=${encodeURIComponent(q)}&k=10&lang=${lang}`,
      );
      const d = await res.json();
      setData(d);
    } catch (err) {
      setData({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  const title =
    lang === "pt"
      ? "Vertex AI Search — Teste sobre Base de Conhecimento"
      : "Vertex AI Search — Knowledge Base Test";

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={16} className="text-brand-primary" />
        <h3 className="text-[15px] font-semibold text-neutral-800">{title}</h3>
      </div>
      <p className="text-[12px] text-neutral-500 mb-4">
        {lang === "pt"
          ? "Consulta o datastore agsf-knowledge-items (só tier público + publicado) via Discovery Engine. Consome o crédito GenAI App Builder."
          : "Queries the agsf-knowledge-items datastore (public + published tiers only) via Discovery Engine. Consumes the GenAI App Builder credit."}
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          placeholder={
            lang === "pt"
              ? "ex: crédito rural para pequeno produtor"
              : "e.g. rural credit for smallholders"
          }
          className="flex-1 px-3 py-2 rounded-md border border-neutral-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
        />
        <button
          onClick={run}
          disabled={loading || !q.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-brand-primary text-white text-[13px] font-semibold disabled:opacity-50 hover:bg-brand-primary/90"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Search size={14} />
          )}
          {lang === "pt" ? "Buscar" : "Search"}
        </button>
      </div>

      {data?.error && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-[12px] text-red-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-mono text-[11px]">{data.error}</p>
            <p className="mt-1 text-[11px] text-red-600">
              {lang === "pt"
                ? "Verifique: VERTEX_SEARCH_ENGINE_ID em .env.local, role Discovery Engine Viewer na SA, indexação concluída (status Active)."
                : "Check: VERTEX_SEARCH_ENGINE_ID in .env.local, Discovery Engine Viewer on SA, indexing done (Active status)."}
            </p>
          </div>
        </div>
      )}

      {data && !data.error && (
        <div className="mt-4 space-y-3">
          {data.summary && (
            <div className="p-3 rounded-md bg-amber-50 border border-amber-200">
              <p className="text-[10px] font-bold uppercase text-amber-700 mb-1">
                {lang === "pt" ? "Resumo gerativo" : "Generative summary"}
              </p>
              <p className="text-[13px] text-amber-900 whitespace-pre-wrap">
                {data.summary}
              </p>
            </div>
          )}

          <p className="text-[11px] text-neutral-500">
            {lang === "pt"
              ? `${data.count ?? 0} resultados • engine ${data.engine} • ${data.location}`
              : `${data.count ?? 0} results • engine ${data.engine} • ${data.location}`}
          </p>

          <div className="space-y-2">
            {(data.hits || []).map((h, i) => (
              <div
                key={h.id || i}
                className="rounded-md border border-neutral-200 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13px] font-semibold text-neutral-800">
                    {i + 1}. {h.title || "—"}
                  </p>
                  {h.category && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 shrink-0">
                      {h.category}
                    </span>
                  )}
                </div>
                {h.snippet != null && (
                  <p className="mt-1 text-[12px] text-neutral-600 line-clamp-3">
                    {typeof h.snippet === "string"
                      ? h.snippet
                      : JSON.stringify(h.snippet)}
                  </p>
                )}
                {h.source_url && (
                  <a
                    href={h.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-[11px] text-brand-primary hover:underline"
                  >
                    {h.source_url}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
