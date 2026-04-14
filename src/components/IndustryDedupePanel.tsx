"use client";

/**
 * IndustryDedupePanel — review + merge duplicate industries.
 *
 * Reads /api/industries/duplicates which surfaces every pair of
 * legal_entities carrying role_type='industry' that look like the
 * same company (Jaro-Winkler ≥ 0.92 on normalized name, plus an
 * "AGROFIT synthetic vs real CNPJ" override). For each pair the
 * user picks the canonical row, optionally swaps it, sees the FK
 * blast radius (how many products / meetings / etc. each side
 * carries), and confirms the merge.
 *
 * The merge is irreversible from the UI today — the
 * `entity_merge_log` snapshot lets us recover later if needed.
 */

import { useCallback, useEffect, useState } from "react";
import { Lang } from "@/lib/i18n";
import {
  Loader2, AlertTriangle, Check, X, ArrowRight, ArrowLeftRight, Factory, Sparkles,
  RefreshCw, Trash2, ChevronDown, ChevronUp, Zap,
} from "lucide-react";
import { formatCnpj } from "@/lib/cnpj";

interface EntityRow {
  entity_uid: string;
  tax_id: string | null;
  display_name: string | null;
  legal_name: string | null;
}

interface Candidate {
  canonical: EntityRow;
  dup: EntityRow;
  similarity: number;
  reason: string;
  fk_counts_dup: Record<string, number>;
  fk_counts_canonical: Record<string, number>;
}

interface FeedResponse {
  candidates: Candidate[];
  total: number;
  summary: Record<string, number>;
  parameters: { min_similarity: number; max: number };
}

const REASON_LABEL: Record<string, { pt: string; en: string; color: string }> = {
  agrofit_synthetic_vs_real: { pt: "AGROFIT × CNPJ real", en: "AGROFIT × real CNPJ", color: "bg-amber-100 text-amber-800 border-amber-300" },
  exact_normalized_name:    { pt: "Nome idêntico", en: "Identical name", color: "bg-purple-100 text-purple-800 border-purple-300" },
  fuzzy_jaro_winkler:       { pt: "Nome similar", en: "Similar name", color: "bg-blue-100 text-blue-800 border-blue-300" },
};

export function IndustryDedupePanel({ lang }: { lang: Lang }) {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [minSim, setMinSim] = useState(0.92);
  const [merging, setMerging] = useState<string | null>(null);
  const [bulkMerging, setBulkMerging] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [swapped, setSwapped] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/industries/duplicates?min_similarity=${minSim}&max=200`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d);
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  }, [minSim]);

  useEffect(() => { load(); }, [load]);

  const pairKey = (c: Candidate) => `${c.canonical.entity_uid}|${c.dup.entity_uid}`;

  const mergeAll = async () => {
    if (!data || data.candidates.length === 0) return;
    const n = data.candidates.length;
    if (!confirm(
      lang === "pt"
        ? `Mesclar TODOS os ${n} pares com canônico já escolhido pelo algoritmo?\n\nIrreversível na UI (snapshots ficam em entity_merge_log).`
        : `Merge ALL ${n} pairs using the algorithm-picked canonical?\n\nIrreversible from the UI (snapshots saved to entity_merge_log).`,
    )) return;
    setBulkMerging(true);
    setResultMsg(null);
    try {
      const r = await fetch(`/api/industries/duplicates?action=bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ min_similarity: minSim }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResultMsg({
        kind: d.failed === 0 ? "ok" : "err",
        text: lang === "pt"
          ? `Bulk merge: ${d.merged} mescladas, ${d.skipped} ignoradas, ${d.failed} falharam · ${d.total_repointed} FKs reapontadas, ${d.total_conflicts} conflitos resolvidos.`
          : `Bulk merge: ${d.merged} merged, ${d.skipped} skipped, ${d.failed} failed · ${d.total_repointed} FKs repointed, ${d.total_conflicts} conflicts resolved.`,
      });
      await load();
    } catch (e: any) {
      setResultMsg({ kind: "err", text: e.message });
    } finally {
      setBulkMerging(false);
    }
  };

  const merge = async (cand: Candidate, swap: boolean) => {
    const canonical = swap ? cand.dup : cand.canonical;
    const dup = swap ? cand.canonical : cand.dup;
    const k = pairKey(cand);
    if (!confirm(
      lang === "pt"
        ? `Mesclar "${dup.display_name}" → "${canonical.display_name}"?\n\nEsta ação é irreversível na UI (o snapshot fica em entity_merge_log).`
        : `Merge "${dup.display_name}" → "${canonical.display_name}"?\n\nThis is irreversible from the UI (snapshot saved in entity_merge_log).`,
    )) return;
    setMerging(k);
    setResultMsg(null);
    try {
      const r = await fetch("/api/industries/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonical_uid: canonical.entity_uid,
          dup_uid: dup.entity_uid,
          similarity: cand.similarity,
          reason: cand.reason,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.errors?.join("; ") || d.error || `HTTP ${r.status}`);
      const repointed = Object.values<number>(d.repointed || {}).reduce((s, n) => s + n, 0);
      const conflicts = Object.values<number>(d.skipped || {}).reduce((s, n) => s + n, 0);
      setResultMsg({
        kind: "ok",
        text: lang === "pt"
          ? `Mesclado: ${repointed} FKs reapontadas, ${conflicts} conflitos resolvidos.`
          : `Merged: ${repointed} FKs repointed, ${conflicts} conflicts resolved.`,
      });
      await load();
    } catch (e: any) {
      setResultMsg({ kind: "err", text: e.message });
    } finally {
      setMerging(null);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-md bg-amber-100 flex items-center justify-center">
            <Sparkles size={18} className="text-amber-700" />
          </div>
          <div>
            <h3 className="text-[17px] font-bold text-neutral-900">
              {lang === "pt" ? "Depurar Indústrias Duplicadas" : "Industry Duplicate Cleanup"}
            </h3>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              {lang === "pt"
                ? "AGROFIT criou registros sintéticos para fabricantes sem CNPJ. Mesclar com a entidade real preserva produtos + reuniões + leads."
                : "AGROFIT created synthetic rows for manufacturers without CNPJ. Merging with the real entity preserves products + meetings + leads."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && data.candidates.length > 0 && (
            <button
              onClick={mergeAll}
              disabled={bulkMerging || loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold text-white bg-emerald-600 border border-emerald-700 rounded hover:bg-emerald-700 disabled:opacity-50"
              title={lang === "pt" ? "Aceitar o canônico do algoritmo para todos e mesclar tudo de uma vez" : "Accept the algorithm's canonical for all and merge in one batch"}
            >
              {bulkMerging ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              {lang === "pt" ? `Mesclar Todos (${data.candidates.length})` : `Merge All (${data.candidates.length})`}
            </button>
          )}
          <button
            onClick={load}
            disabled={loading || bulkMerging}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-neutral-700 bg-white border border-neutral-200 rounded hover:border-neutral-400 disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {lang === "pt" ? "Recarregar" : "Reload"}
          </button>
        </div>
      </div>

      {/* Threshold + summary */}
      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-neutral-50 border border-neutral-200 rounded">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
            {lang === "pt" ? "Limiar" : "Threshold"}
          </span>
          <input
            type="range"
            min="0.7"
            max="1"
            step="0.01"
            value={minSim}
            onChange={(e) => setMinSim(Number(e.target.value))}
            className="w-32"
          />
          <span className="text-[12px] font-mono text-neutral-700">{minSim.toFixed(2)}</span>
        </div>
        {data && (
          <>
            <span className="text-[11px] text-neutral-400">·</span>
            <span className="text-[11px] text-neutral-700">
              <b className="text-neutral-900">{data.total}</b> {lang === "pt" ? "pares" : "pairs"}
            </span>
            {Object.entries(data.summary).map(([k, n]) => {
              const info = REASON_LABEL[k] || { pt: k, en: k, color: "bg-neutral-100 text-neutral-700 border-neutral-200" };
              return (
                <span key={k} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${info.color}`}>
                  {n} {lang === "pt" ? info.pt : info.en}
                </span>
              );
            })}
          </>
        )}
      </div>

      {resultMsg && (
        <div className={`mb-3 p-2 border rounded text-[12px] flex items-start gap-2 ${
          resultMsg.kind === "ok"
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {resultMsg.kind === "ok" ? <Check size={13} className="mt-0.5" /> : <AlertTriangle size={13} className="mt-0.5" />}
          <span className="flex-1">{resultMsg.text}</span>
          <button onClick={() => setResultMsg(null)}>
            <X size={11} />
          </button>
        </div>
      )}

      {err && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-[12px] text-red-700 mb-3">
          {err}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-neutral-400" />
        </div>
      ) : !data || data.candidates.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-neutral-500">
          {lang === "pt" ? "Nenhum par duplicado encontrado." : "No duplicate pairs found."}
        </div>
      ) : (
        <div className="space-y-2">
          {data.candidates.map((c) => {
            const k = pairKey(c);
            const isSwapped = swapped.has(k);
            const canonical = isSwapped ? c.dup : c.canonical;
            const dup = isSwapped ? c.canonical : c.dup;
            return (
              <CandidatePair
                key={k}
                cand={c}
                canonical={canonical}
                dup={dup}
                lang={lang}
                merging={merging === k}
                onSwap={() => {
                  setSwapped((s) => {
                    const next = new Set(s);
                    if (next.has(k)) next.delete(k); else next.add(k);
                    return next;
                  });
                }}
                onMerge={() => merge(c, isSwapped)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Pair card ────────────────────────────────────────────────────────

function CandidatePair({
  cand, canonical, dup, lang, merging, onSwap, onMerge,
}: {
  cand: Candidate;
  canonical: EntityRow;
  dup: EntityRow;
  lang: Lang;
  merging: boolean;
  onSwap: () => void;
  onMerge: () => void;
}) {
  const [open, setOpen] = useState(false);
  const reasonInfo = REASON_LABEL[cand.reason] || { pt: cand.reason, en: cand.reason, color: "bg-neutral-100 text-neutral-700 border-neutral-200" };
  const score = Math.round(cand.similarity * 100);
  const fkRows = (counts: Record<string, number>) =>
    Object.entries(counts).sort((a, b) => b[1] - a[1]);

  const totalDup = Object.values(cand.fk_counts_dup).reduce((s, n) => s + n, 0);
  const totalCanonical = Object.values(cand.fk_counts_canonical).reduce((s, n) => s + n, 0);

  return (
    <div className="bg-white border border-neutral-200 rounded-md overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] items-center gap-2 p-3">
        <EntityCard row={canonical} lang={lang} role="canonical" totalFks={totalCanonical} />
        <button
          type="button"
          onClick={onSwap}
          title={lang === "pt" ? "Inverter (escolher o outro como canônico)" : "Swap (use the other as canonical)"}
          className="self-center p-1.5 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-900"
        >
          <ArrowLeftRight size={14} />
        </button>
        <EntityCard row={dup} lang={lang} role="dup" totalFks={totalDup} />
        <div className="flex flex-col items-end gap-1.5">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${reasonInfo.color}`}>
            {lang === "pt" ? reasonInfo.pt : reasonInfo.en}
          </span>
          <span className="text-[10px] font-mono text-neutral-500">{score}%</span>
          <button
            onClick={onMerge}
            disabled={merging}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-bold rounded hover:bg-emerald-700 disabled:opacity-50"
          >
            {merging ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            {merging ? (lang === "pt" ? "Mesclando..." : "Merging...") : (lang === "pt" ? "Mesclar" : "Merge")}
          </button>
          <button
            onClick={() => setOpen(!open)}
            className="text-[10px] text-neutral-500 hover:text-neutral-900 inline-flex items-center gap-0.5"
          >
            {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {lang === "pt" ? "FKs" : "FKs"}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-neutral-200 bg-neutral-50/50 p-3 grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <p className="font-bold text-emerald-700 mb-1">
              {lang === "pt" ? "Canônico permanece" : "Canonical keeps"}
            </p>
            {fkRows(cand.fk_counts_canonical).length === 0 ? (
              <p className="text-neutral-400 italic">{lang === "pt" ? "(nenhuma FK)" : "(no FKs)"}</p>
            ) : (
              <ul className="space-y-0.5">
                {fkRows(cand.fk_counts_canonical).map(([t, n]) => (
                  <li key={t} className="flex items-center justify-between">
                    <span className="font-mono text-neutral-600">{t}</span>
                    <span className="font-bold text-neutral-900">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="font-bold text-amber-700 mb-1">
              {lang === "pt" ? "Dup será reapontada" : "Dup will be repointed"}
            </p>
            {fkRows(cand.fk_counts_dup).length === 0 ? (
              <p className="text-neutral-400 italic">{lang === "pt" ? "(nenhuma FK)" : "(no FKs)"}</p>
            ) : (
              <ul className="space-y-0.5">
                {fkRows(cand.fk_counts_dup).map(([t, n]) => (
                  <li key={t} className="flex items-center justify-between">
                    <span className="font-mono text-neutral-600">{t}</span>
                    <span className="font-bold text-neutral-900">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EntityCard({ row, lang, role, totalFks }: { row: EntityRow; lang: Lang; role: "canonical" | "dup"; totalFks: number }) {
  const isSynthetic = !!row.tax_id && row.tax_id.startsWith("AGROFIT_");
  const accent = role === "canonical"
    ? "border-emerald-200 bg-emerald-50/40"
    : "border-amber-200 bg-amber-50/40";
  const tag = role === "canonical"
    ? { pt: "MANTER", en: "KEEP",   bg: "bg-emerald-600" }
    : { pt: "REMOVER", en: "REMOVE", bg: "bg-amber-600" };

  return (
    <div className={`rounded-md border p-2.5 ${accent}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded text-white ${tag.bg}`}>
          {lang === "pt" ? tag.pt : tag.en}
        </span>
        {isSynthetic && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 uppercase">
            AGROFIT
          </span>
        )}
        {totalFks > 0 && (
          <span className="text-[9px] text-neutral-500">{totalFks} FKs</span>
        )}
      </div>
      <p className="text-[12px] font-bold text-neutral-900 truncate" title={row.display_name || row.legal_name || ""}>
        {row.display_name || row.legal_name || "—"}
      </p>
      <p className="text-[10px] font-mono text-neutral-500 truncate">
        {isSynthetic
          ? row.tax_id
          : (row.tax_id ? formatCnpj(row.tax_id) : (lang === "pt" ? "(sem CNPJ)" : "(no CNPJ)"))}
        <span className="ml-1.5 text-neutral-400">{row.entity_uid.slice(0, 8)}…</span>
      </p>
    </div>
  );
}
