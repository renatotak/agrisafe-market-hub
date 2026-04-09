"use client";

/**
 * Phase 24G2 — ActivityLogPanel.
 *
 * Mounted in Settings → "Registro de Atividade". Browses the
 * `activity_log` table built by migration 043 and populated by every
 * cron, manual endpoint, Chrome extension, and backfill script through
 * `src/lib/activity-log.ts`.
 *
 * Three filter chip rows: source_kind / target_table / action.
 * Click any chip to scope the feed. Refresh button reloads.
 *
 * Each row shows:
 *   - icon by action (insert/update/upsert/delete)
 *   - source label (sync-cnj-atos / manual:rj_add / reading-room-extension / ...)
 *   - target table + id
 *   - human summary (the headline the helper baked at write time)
 *   - relative time
 */

import { useEffect, useState } from "react";
import { Lang } from "@/lib/i18n";
import {
  Activity, RefreshCw, Loader2, FileText, Database, User, Calendar,
  Bot, Hand, Puzzle, Layers, Cog, Plus, Edit, Trash2, ArrowUp, X,
} from "lucide-react";

interface ActivityRow {
  id: string;
  action: "insert" | "update" | "upsert" | "delete";
  target_table: string;
  target_id: string | null;
  source: string;
  source_kind: "cron" | "manual" | "extension" | "backfill" | "system";
  actor: string | null;
  summary: string | null;
  metadata: Record<string, any>;
  confidentiality: string;
  created_at: string;
}

interface ActivityResponse {
  activities: ActivityRow[];
  summary: {
    total: number;
    by_source_kind: Record<string, number>;
    by_target_table: Record<string, number>;
    by_action: Record<string, number>;
  };
  caller_tier: string;
}

const SOURCE_KIND_LABELS: Record<string, { pt: string; en: string; icon: any; color: string }> = {
  cron:      { pt: "Cron",        en: "Cron",       icon: Bot,    color: "bg-blue-100 text-blue-700 border-blue-200" },
  manual:    { pt: "Manual",      en: "Manual",     icon: Hand,   color: "bg-purple-100 text-purple-700 border-purple-200" },
  extension: { pt: "Extensão",    en: "Extension",  icon: Puzzle, color: "bg-amber-100 text-amber-700 border-amber-200" },
  backfill:  { pt: "Backfill",    en: "Backfill",   icon: Layers, color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  system:    { pt: "Sistema",     en: "System",     icon: Cog,    color: "bg-neutral-100 text-neutral-700 border-neutral-200" },
};

const ACTION_LABELS: Record<string, { icon: any; color: string; label: string }> = {
  insert: { icon: Plus,    color: "text-emerald-600",  label: "INS" },
  upsert: { icon: ArrowUp, color: "text-blue-600",     label: "UPS" },
  update: { icon: Edit,    color: "text-amber-600",    label: "UPD" },
  delete: { icon: Trash2,  color: "text-red-600",      label: "DEL" },
};

function relativeTime(iso: string, lang: Lang): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (lang === "pt") {
    if (sec < 60) return "agora";
    if (min < 60) return `${min}min`;
    if (hr < 24) return `${hr}h`;
    if (day < 7) return `${day}d`;
    return new Date(iso).toLocaleDateString("pt-BR");
  }
  if (sec < 60) return "now";
  if (min < 60) return `${min}m`;
  if (hr < 24) return `${hr}h`;
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString("en-US");
}

export function ActivityLogPanel({ lang }: { lang: Lang }) {
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterKind, setFilterKind] = useState<string | null>(null);
  const [filterTable, setFilterTable] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (filterKind) params.set("source_kind", filterKind);
      if (filterTable) params.set("target_table", filterTable);
      const res = await fetch(`/api/activity?${params.toString()}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKind, filterTable, limit]);

  const filtered = (data?.activities || []).filter((r) => !filterAction || r.action === filterAction);

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-md bg-blue-100 flex items-center justify-center">
            <Activity size={18} className="text-blue-600" />
          </div>
          <div>
            <h3 className="text-[17px] font-bold text-neutral-900">
              {lang === "pt" ? "Registro de Atividade" : "Activity Log"}
            </h3>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              {lang === "pt"
                ? "Tudo que foi adicionado ou alterado: crons, scrapers, extensão Chrome, inserções manuais."
                : "Everything added or changed: crons, scrapers, Chrome extension, manual inserts."}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold border border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-40"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {lang === "pt" ? "Atualizar" : "Refresh"}
        </button>
      </div>

      {/* Filter chip rows */}
      {data && (
        <div className="space-y-2 mb-4">
          <ChipRow
            label={lang === "pt" ? "Origem" : "Source kind"}
            counts={data.summary.by_source_kind}
            active={filterKind}
            onSelect={setFilterKind}
            renderLabel={(k) => (lang === "pt" ? SOURCE_KIND_LABELS[k]?.pt : SOURCE_KIND_LABELS[k]?.en) || k}
            kindColors
          />
          <ChipRow
            label={lang === "pt" ? "Tabela" : "Table"}
            counts={data.summary.by_target_table}
            active={filterTable}
            onSelect={setFilterTable}
            renderLabel={(k) => k}
          />
          <ChipRow
            label={lang === "pt" ? "Ação" : "Action"}
            counts={data.summary.by_action}
            active={filterAction}
            onSelect={setFilterAction}
            renderLabel={(k) => k.toUpperCase()}
          />
        </div>
      )}

      {/* Active filters bar */}
      {(filterKind || filterTable || filterAction) && (
        <div className="flex items-center gap-2 mb-3 text-[11px] text-neutral-500">
          <span>{lang === "pt" ? "Filtros ativos:" : "Active filters:"}</span>
          {filterKind && (
            <ActiveFilterPill label={`origem=${filterKind}`} onClear={() => setFilterKind(null)} />
          )}
          {filterTable && (
            <ActiveFilterPill label={`tabela=${filterTable}`} onClear={() => setFilterTable(null)} />
          )}
          {filterAction && (
            <ActiveFilterPill label={`ação=${filterAction}`} onClear={() => setFilterAction(null)} />
          )}
        </div>
      )}

      {/* Feed */}
      {loading && !data ? (
        <div className="flex items-center justify-center py-12 gap-2 text-neutral-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-[12px]">{lang === "pt" ? "Carregando..." : "Loading..."}</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-[12px] text-neutral-400">
          {lang === "pt" ? "Sem registros para os filtros selecionados." : "No entries for the selected filters."}
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
          {filtered.map((row) => (
            <ActivityRowCard key={row.id} row={row} lang={lang} />
          ))}
        </div>
      )}

      {/* Footer count + load more */}
      {data && (
        <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-400">
          <span>
            {filtered.length} {lang === "pt" ? "registros mostrados" : "entries shown"}
            {data.activities.length === limit && (
              <span className="ml-1">
                ({lang === "pt" ? "limite" : "limit"} {limit})
              </span>
            )}
          </span>
          {data.activities.length === limit && limit < 500 && (
            <button
              onClick={() => setLimit(Math.min(500, limit + 100))}
              className="text-brand-primary hover:underline font-bold"
            >
              {lang === "pt" ? "Carregar mais" : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function ChipRow({
  label, counts, active, onSelect, renderLabel, kindColors,
}: {
  label: string;
  counts: Record<string, number>;
  active: string | null;
  onSelect: (k: string | null) => void;
  renderLabel: (k: string) => string;
  kindColors?: boolean;
}) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider min-w-[56px]">
        {label}
      </span>
      {entries.map(([k, count]) => {
        const isActive = active === k;
        const kindColor = kindColors ? SOURCE_KIND_LABELS[k]?.color : null;
        return (
          <button
            key={k}
            onClick={() => onSelect(isActive ? null : k)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all ${
              isActive
                ? "bg-brand-primary text-white border-brand-primary"
                : kindColor
                  ? kindColor
                  : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300"
            }`}
          >
            {renderLabel(k)}
            <span className="text-[9px] opacity-70">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function ActiveFilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand-surface border border-brand-light text-[10px] text-brand-primary font-bold">
      {label}
      <button onClick={onClear} className="hover:text-error transition-colors">
        <X size={9} />
      </button>
    </span>
  );
}

function ActivityRowCard({ row, lang }: { row: ActivityRow; lang: Lang }) {
  const action = ACTION_LABELS[row.action] || ACTION_LABELS.upsert;
  const kind = SOURCE_KIND_LABELS[row.source_kind] || SOURCE_KIND_LABELS.system;
  const ActionIcon = action.icon;
  const KindIcon = kind.icon;

  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-md border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-colors">
      {/* Action icon */}
      <div className={`mt-0.5 ${action.color} shrink-0`} title={action.label}>
        <ActionIcon size={14} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${kind.color}`}>
            <KindIcon size={9} />
            {row.source_kind}
          </span>
          <span className="text-[10px] font-mono text-neutral-500">{row.source}</span>
          <span className="text-[10px] text-neutral-300">→</span>
          <span className="text-[10px] font-mono text-neutral-700 font-bold">{row.target_table}</span>
          {row.target_id && (
            <span className="text-[9px] font-mono text-neutral-400 truncate max-w-[140px]">
              {row.target_id.length > 18 ? row.target_id.slice(0, 8) + "…" + row.target_id.slice(-6) : row.target_id}
            </span>
          )}
          {row.confidentiality !== "public" && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 uppercase">
              {row.confidentiality.replace("agrisafe_", "")}
            </span>
          )}
        </div>
        {row.summary && (
          <p className="text-[12px] text-neutral-800 leading-snug line-clamp-2">{row.summary}</p>
        )}
      </div>

      {/* Time */}
      <div className="text-[10px] text-neutral-400 shrink-0 font-mono" title={new Date(row.created_at).toLocaleString(lang === "pt" ? "pt-BR" : "en-US")}>
        {relativeTime(row.created_at, lang)}
      </div>
    </div>
  );
}
