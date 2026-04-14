"use client";

/**
 * MeetingsLog — "patient record" feed: one card per company with the
 * full meeting history inside.
 *
 * The cross-entity flat feed lives in the `/api/crm/meetings/feed`
 * endpoint and can still be reached via the JSON API; this UI now
 * groups everything by entity (backed by
 * /api/crm/meetings/by-entity) so the user can scan company by
 * company — the same shape they already use in the Diretório
 * expanded panels. Filters + sort + free-text search still work,
 * but they apply at the meeting level and the entity card is
 * simply the roll-up of whatever matched.
 *
 * Confidentiality is visible on every card: the counts of
 * confidential vs publishable meetings make it obvious which
 * parts of the record the Diretório will surface publicly.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Lang } from "@/lib/i18n";
import {
  Calendar, Search, Loader2, Filter, X, Edit3, Trash2, ChevronLeft, ChevronRight,
  Users, Target, AlertTriangle, Lock, Globe, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown,
  Copy, ExternalLink, Check, ChevronDown, ChevronUp, Building2, Plus,
} from "lucide-react";
import { MeetingFormModal, type MeetingRecord } from "@/components/MeetingFormModal";
import { formatCnpj, buildMatrizCnpj, cnpjPublicUrl } from "@/lib/cnpj";

interface Meeting {
  id: string;
  entity_uid: string;
  entity_name: string | null;
  entity_tax_id: string | null;
  entity_roles: string[] | null;
  meeting_date: string;
  meeting_type: string;
  attendees: string[] | null;
  agenda: string | null;
  summary: string | null;
  next_steps: string | null;
  outcome: string;
  source: string;
  confidentiality: string;
  competitor_tech: string[];
  service_interest: string[];
  financial_info: string | null;
  mood: string | null;
  plans: string | null;
}

interface EntityCard {
  entity_uid: string;
  entity_name: string | null;
  entity_tax_id: string | null;
  entity_roles: string[];
  meeting_count: number;
  last_meeting_date: string | null;
  first_meeting_date: string | null;
  competitor_tech: string[];
  service_interest: string[];
  mood_counts: Record<string, number>;
  outcome_counts: Record<string, number>;
  confidentiality_counts: Record<string, number>;
  onenote_count: number;
  key_person_count: number;
  lead_stage: string | null;
  lead_service_interest: string | null;
  lead_estimated_value_brl: number | null;
  meetings: Meeting[];
}

interface TagCatalog {
  competitor_tech: string[];
  service_interest: string[];
  moods: string[];
}

const TYPE_LABELS: Record<string, { pt: string; en: string }> = {
  comercial:  { pt: "Comercial",    en: "Commercial" },
  tecnica:    { pt: "Técnica",      en: "Technical" },
  prospeccao: { pt: "Prospecção",   en: "Prospecting" },
  followup:   { pt: "Follow-up",    en: "Follow-up" },
  contrato:   { pt: "Contrato",     en: "Contract" },
  outro:      { pt: "Outro",        en: "Other" },
};

const OUTCOME_LABELS: Record<string, { pt: string; en: string; color: string }> = {
  pending:  { pt: "Pendente", en: "Pending",  color: "bg-neutral-100 text-neutral-600" },
  positive: { pt: "Positivo", en: "Positive", color: "bg-emerald-100 text-emerald-700" },
  neutral:  { pt: "Neutro",   en: "Neutral",  color: "bg-neutral-100 text-neutral-700" },
  negative: { pt: "Negativo", en: "Negative", color: "bg-red-100 text-red-700" },
};

const MOOD_EMOJI: Record<string, string> = {
  excited: "🔥", positive: "🙂", neutral: "😐", cautious: "🤔", negative: "☹️",
};

const STAGE_COLORS: Record<string, string> = {
  new: "bg-neutral-100 text-neutral-700",
  qualified: "bg-blue-100 text-blue-700",
  proposal: "bg-indigo-100 text-indigo-700",
  negotiation: "bg-amber-100 text-amber-700",
  won: "bg-emerald-100 text-emerald-700",
  lost: "bg-red-100 text-red-700",
  dormant: "bg-neutral-200 text-neutral-500",
};

const PAGE_SIZE = 20;

export function MeetingsLog({ lang }: { lang: Lang }) {
  const [entities, setEntities] = useState<EntityCard[]>([]);
  const [totalEntities, setTotalEntities] = useState(0);
  const [totalMeetings, setTotalMeetings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tagCatalog, setTagCatalog] = useState<TagCatalog>({
    competitor_tech: [], service_interest: [], moods: [],
  });

  // Filters
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState("");
  const [outcome, setOutcome] = useState("");
  const [mood, setMood] = useState("");
  const [tech, setTech] = useState("");
  const [service, setService] = useState("");
  const [confidentiality, setConfidentiality] = useState("");
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  type SortField = "last_meeting_date" | "meeting_count" | "entity_name" | "first_meeting_date";
  const [sortField, setSortField] = useState<SortField>("last_meeting_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; entityUid: string; entityName: string | null; entityTaxId: string | null; meeting: Meeting | null } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (type) params.set("type", type);
      if (outcome) params.set("outcome", outcome);
      if (mood) params.set("mood", mood);
      if (tech) params.set("tech", tech);
      if (service) params.set("service", service);
      if (confidentiality) params.set("confidentiality", confidentiality);
      params.set("sort", sortField);
      params.set("dir", sortDir);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      params.set("with_tags", "true");

      const res = await fetch(`/api/crm/meetings/by-entity?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEntities(data.entities || []);
      setTotalEntities(data.total_entities || 0);
      setTotalMeetings(data.total_meetings || 0);
      if (data.tag_catalog) setTagCatalog(data.tag_catalog);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [q, from, to, type, outcome, mood, tech, service, confidentiality, sortField, sortDir, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => { setPage(0); }, [q, from, to, type, outcome, mood, tech, service, confidentiality, sortField, sortDir]);

  const clearAll = () => {
    setQ(""); setFrom(""); setTo(""); setType(""); setOutcome("");
    setMood(""); setTech(""); setService(""); setConfidentiality("");
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortField(field);
      setSortDir(field === "entity_name" ? "asc" : "desc");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(lang === "pt" ? "Remover reunião?" : "Remove meeting?")) return;
    await fetch(`/api/crm/meetings?id=${id}`, { method: "DELETE" });
    fetchData();
  };

  const totalPages = Math.max(1, Math.ceil(totalEntities / PAGE_SIZE));
  const activeFilterCount = [q, from, to, type, outcome, mood, tech, service, confidentiality].filter(Boolean).length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[20px] font-bold text-neutral-900">
            {lang === "pt" ? "Log de Reuniões" : "Meetings Log"}
          </h2>
          <p className="text-[12px] text-neutral-500 mt-0.5">
            {lang === "pt"
              ? `${totalEntities.toLocaleString("pt-BR")} empresas · ${totalMeetings.toLocaleString("pt-BR")} reuniões · CRM AgriSafe`
              : `${totalEntities.toLocaleString("en-US")} companies · ${totalMeetings.toLocaleString("en-US")} meetings · AgriSafe CRM`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:border-neutral-400"
          >
            <RefreshCw size={13} />
            {lang === "pt" ? "Atualizar" : "Refresh"}
          </button>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-lg border ${
              activeFilterCount > 0
                ? "bg-purple-50 text-purple-700 border-purple-300"
                : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400"
            }`}
          >
            <Filter size={13} />
            {lang === "pt" ? "Filtros" : "Filters"}
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-purple-600 text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Confidentiality legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500 mb-3 px-1">
        <span className="font-semibold uppercase tracking-wider text-neutral-400">
          {lang === "pt" ? "Visibilidade:" : "Visibility:"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-500" />
          <Lock size={10} />
          {lang === "pt" ? "Confidencial — só no Log de Reuniões" : "Confidential — Meetings Log only"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-brand-primary" />
          <Globe size={10} />
          {lang === "pt" ? "Publicável — visível no Diretório de Canais / Indústrias" : "Publishable — visible in the Directories"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-neutral-400" />
          <Globe size={10} />
          {lang === "pt" ? "Público — todos os contextos" : "Public — all contexts"}
        </span>
      </div>

      {/* Search + filters */}
      <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={lang === "pt" ? "Buscar por empresa, pauta ou resumo..." : "Search by company, agenda or summary..."}
              className="w-full pl-8 pr-3 py-2 text-[13px] border border-neutral-200 rounded focus:outline-none focus:border-purple-400"
            />
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={clearAll}
              className="text-[11px] text-neutral-500 hover:text-neutral-900 flex items-center gap-1 px-2 py-1 rounded hover:bg-neutral-100"
            >
              <X size={11} />
              {lang === "pt" ? "Limpar" : "Clear"}
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="mt-4 pt-4 border-t border-neutral-200 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <FilterInput label={lang === "pt" ? "De" : "From"} type="date" value={from} onChange={setFrom} />
              <FilterInput label={lang === "pt" ? "Até" : "To"} type="date" value={to} onChange={setTo} />
              <FilterSelect
                label={lang === "pt" ? "Tipo" : "Type"}
                value={type}
                onChange={setType}
                options={[
                  { value: "", label: lang === "pt" ? "Todos" : "All" },
                  ...Object.entries(TYPE_LABELS).map(([k, v]) => ({ value: k, label: lang === "pt" ? v.pt : v.en })),
                ]}
              />
              <FilterSelect
                label={lang === "pt" ? "Desfecho" : "Outcome"}
                value={outcome}
                onChange={setOutcome}
                options={[
                  { value: "", label: lang === "pt" ? "Todos" : "All" },
                  ...Object.entries(OUTCOME_LABELS).map(([k, v]) => ({ value: k, label: lang === "pt" ? v.pt : v.en })),
                ]}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <FilterSelect
                label="Mood"
                value={mood}
                onChange={setMood}
                options={[
                  { value: "", label: lang === "pt" ? "Todos" : "All" },
                  ...tagCatalog.moods.map((m) => ({ value: m, label: `${MOOD_EMOJI[m] || ""} ${m}` })),
                ]}
              />
              <FilterSelect
                label={lang === "pt" ? "Tecnologia citada" : "Tech mentioned"}
                value={tech}
                onChange={setTech}
                options={[
                  { value: "", label: lang === "pt" ? "Todas" : "All" },
                  ...tagCatalog.competitor_tech.map((t) => ({ value: t, label: t })),
                ]}
              />
              <FilterSelect
                label={lang === "pt" ? "Serviço interesse" : "Service interest"}
                value={service}
                onChange={setService}
                options={[
                  { value: "", label: lang === "pt" ? "Todos" : "All" },
                  ...tagCatalog.service_interest.map((s) => ({ value: s, label: s })),
                ]}
              />
            </div>
            <FilterSelect
              label={lang === "pt" ? "Confidencialidade" : "Confidentiality"}
              value={confidentiality}
              onChange={setConfidentiality}
              options={[
                { value: "", label: lang === "pt" ? "Todas" : "All" },
                { value: "agrisafe_confidential", label: lang === "pt" ? "Confidencial" : "Confidential" },
                { value: "agrisafe_published", label: lang === "pt" ? "Publicável" : "Publishable" },
                { value: "public", label: lang === "pt" ? "Público" : "Public" },
              ]}
            />
          </div>
        )}
      </div>

      {/* Sort bar */}
      <div className="flex items-center gap-1 text-[11px] text-neutral-500 mb-2 px-1 flex-wrap">
        <span className="font-semibold uppercase tracking-wider mr-1">
          {lang === "pt" ? "Ordenar empresas por:" : "Sort companies by:"}
        </span>
        <SortButton label={lang === "pt" ? "Última reunião" : "Last meeting"} field="last_meeting_date" activeField={sortField} activeDir={sortDir} onClick={() => toggleSort("last_meeting_date")} />
        <SortButton label={lang === "pt" ? "Nº reuniões" : "# meetings"}      field="meeting_count"     activeField={sortField} activeDir={sortDir} onClick={() => toggleSort("meeting_count")} />
        <SortButton label={lang === "pt" ? "Nome" : "Name"}                    field="entity_name"       activeField={sortField} activeDir={sortDir} onClick={() => toggleSort("entity_name")} />
        <SortButton label={lang === "pt" ? "Primeira reunião" : "First meeting"} field="first_meeting_date" activeField={sortField} activeDir={sortDir} onClick={() => toggleSort("first_meeting_date")} />
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-700 flex items-center gap-2 mb-4">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-neutral-400" />
        </div>
      ) : entities.length === 0 ? (
        <div className="bg-white rounded-lg border border-neutral-200 p-10 text-center">
          <Calendar size={32} className="mx-auto text-neutral-300 mb-3" />
          <p className="text-[13px] text-neutral-500">
            {lang === "pt"
              ? activeFilterCount > 0
                ? "Nenhuma empresa com reuniões nos filtros aplicados."
                : "Nenhuma empresa com reuniões registradas ainda."
              : activeFilterCount > 0
                ? "No companies match the current filters."
                : "No companies with meetings yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entities.map((ent) => (
            <EntityRecord
              key={ent.entity_uid}
              entity={ent}
              lang={lang}
              expanded={expandedUid === ent.entity_uid}
              onToggle={() => setExpandedUid(expandedUid === ent.entity_uid ? null : ent.entity_uid)}
              onAdd={() => setModal({ mode: "create", entityUid: ent.entity_uid, entityName: ent.entity_name, entityTaxId: ent.entity_tax_id, meeting: null })}
              onEdit={(m) => setModal({ mode: "edit", entityUid: ent.entity_uid, entityName: ent.entity_name, entityTaxId: ent.entity_tax_id, meeting: m })}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalEntities > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-[11px] text-neutral-500">
            {lang === "pt"
              ? `Página ${page + 1} de ${totalPages} · ${totalEntities} empresas`
              : `Page ${page + 1} of ${totalPages} · ${totalEntities} companies`}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="p-1.5 rounded hover:bg-neutral-100 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded hover:bg-neutral-100 disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Meeting form modal */}
      {modal && (
        <MeetingFormModal
          lang={lang}
          entityUid={modal.entityUid}
          entityName={modal.entityName}
          entityTaxId={modal.entityTaxId}
          meeting={modal.meeting ? meetingToRecord(modal.meeting) : null}
          suggestedTech={tagCatalog.competitor_tech}
          suggestedService={tagCatalog.service_interest}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchData(); }}
        />
      )}
    </div>
  );
}

function meetingToRecord(m: Meeting): MeetingRecord {
  return {
    id: m.id,
    entity_uid: m.entity_uid,
    meeting_date: m.meeting_date,
    meeting_type: m.meeting_type,
    attendees: m.attendees,
    agenda: m.agenda,
    summary: m.summary,
    next_steps: m.next_steps,
    outcome: m.outcome,
    source: m.source,
    confidentiality: m.confidentiality,
    metadata: {
      competitor_tech: m.competitor_tech,
      service_interest: m.service_interest,
      financial_info: m.financial_info,
      mood: m.mood,
      plans: m.plans,
    },
  };
}

// ─── Entity "patient record" card ─────────────────────────────────────

function EntityRecord({
  entity, lang, expanded, onToggle, onAdd, onEdit, onDelete,
}: {
  entity: EntityCard;
  lang: Lang;
  expanded: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onEdit: (m: Meeting) => void;
  onDelete: (id: string) => void;
}) {
  const matrizCnpj = entity.entity_tax_id ? buildMatrizCnpj(entity.entity_tax_id) : "";
  const cnpjDisplay = matrizCnpj ? formatCnpj(matrizCnpj) : null;
  const publicUrl = cnpjPublicUrl(matrizCnpj);

  const lastDate = entity.last_meeting_date
    ? new Date(entity.last_meeting_date + "T12:00:00").toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  const confidentialCount = entity.confidentiality_counts.agrisafe_confidential || 0;
  const publishedCount = entity.confidentiality_counts.agrisafe_published || 0;
  const publicCount = entity.confidentiality_counts.public || 0;
  const dominantMood = Object.entries(entity.mood_counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return (
    <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-neutral-50 transition-colors"
      >
        <div className="shrink-0 mt-0.5">
          <div className="w-9 h-9 rounded-md bg-purple-100 flex items-center justify-center">
            <Building2 size={16} className="text-purple-600" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-[14px] font-bold text-neutral-900 truncate">
              {entity.entity_name || "—"}
            </p>
            {(entity.entity_roles || []).slice(0, 3).map((r) => (
              <span key={r} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 uppercase">
                {r.replace(/_/g, " ")}
              </span>
            ))}
            {entity.lead_stage && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${STAGE_COLORS[entity.lead_stage] || "bg-neutral-100 text-neutral-700"}`}>
                {entity.lead_stage}
              </span>
            )}
          </div>
          {cnpjDisplay && (
            <CnpjInline cnpj={cnpjDisplay} raw={matrizCnpj} publicUrl={publicUrl} lang={lang} />
          )}
          <div className="flex items-center gap-3 mt-1 text-[11px] text-neutral-500 flex-wrap">
            <span><b className="text-neutral-900">{entity.meeting_count}</b> {lang === "pt" ? "reuniões" : "meetings"}</span>
            <span>•</span>
            <span>
              {lang === "pt" ? "Última:" : "Last:"} <b className="text-neutral-900">{lastDate}</b>
            </span>
            {entity.key_person_count > 0 && (
              <>
                <span>•</span>
                <span>
                  <Users size={10} className="inline mr-0.5" />
                  {entity.key_person_count} {lang === "pt" ? "contatos" : "contacts"}
                </span>
              </>
            )}
            {dominantMood && (
              <>
                <span>•</span>
                <span title={dominantMood}>{MOOD_EMOJI[dominantMood] || ""} {dominantMood}</span>
              </>
            )}
            {entity.onenote_count > 0 && (
              <>
                <span>•</span>
                <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded uppercase">
                  {entity.onenote_count} OneNote
                </span>
              </>
            )}
          </div>

          {/* Visibility split */}
          <div className="flex items-center gap-2 mt-1.5 text-[10px]">
            {confidentialCount > 0 && (
              <span className="inline-flex items-center gap-1 text-purple-700" title={lang === "pt" ? "Visível só no Log de Reuniões" : "Meetings Log only"}>
                <Lock size={9} />
                {confidentialCount} {lang === "pt" ? "confidenciais" : "confidential"}
              </span>
            )}
            {publishedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-brand-primary" title={lang === "pt" ? "Aparece no Diretório (parceiros autenticados)" : "Visible in the Directories"}>
                <Globe size={9} />
                {publishedCount} {lang === "pt" ? "publicáveis" : "publishable"}
              </span>
            )}
            {publicCount > 0 && (
              <span className="inline-flex items-center gap-1 text-neutral-500">
                <Globe size={9} />
                {publicCount} {lang === "pt" ? "públicas" : "public"}
              </span>
            )}
          </div>

          {/* Tag clouds */}
          {(entity.competitor_tech.length > 0 || entity.service_interest.length > 0) && (
            <div className="flex flex-wrap gap-1 mt-2">
              {entity.competitor_tech.map((t) => (
                <span key={"t-" + t} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  {t}
                </span>
              ))}
              {entity.service_interest.map((s) => (
                <span key={"s-" + s} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onAdd(); } }}
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 cursor-pointer"
            title={lang === "pt" ? "Registrar nova reunião" : "Log new meeting"}
          >
            <Plus size={10} />
            {lang === "pt" ? "Reunião" : "Meeting"}
          </span>
          {expanded ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}
        </div>
      </button>

      {/* Expanded meeting list */}
      {expanded && (
        <div className="border-t border-neutral-200 bg-neutral-50/50 p-3 space-y-2">
          {entity.meetings.length === 0 ? (
            <p className="text-[11px] text-neutral-400 italic text-center py-3">
              {lang === "pt" ? "Nenhuma reunião corresponde aos filtros." : "No meetings match the filters."}
            </p>
          ) : (
            entity.meetings.map((m) => (
              <MeetingRow key={m.id} meeting={m} lang={lang} onEdit={() => onEdit(m)} onDelete={() => onDelete(m.id)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function MeetingRow({
  meeting, lang, onEdit, onDelete,
}: {
  meeting: Meeting;
  lang: Lang;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const typeInfo = TYPE_LABELS[meeting.meeting_type] || TYPE_LABELS.outro;
  const outcomeInfo = OUTCOME_LABELS[meeting.outcome] || OUTCOME_LABELS.pending;
  const dateStr = new Date(meeting.meeting_date + "T12:00:00").toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short", year: "numeric" });
  const TierIcon = meeting.confidentiality === "public" ? Globe
    : meeting.confidentiality === "agrisafe_published" ? Globe
    : Lock;
  const tierColor = meeting.confidentiality === "agrisafe_confidential" ? "text-purple-600"
    : meeting.confidentiality === "agrisafe_published" ? "text-brand-primary"
    : "text-neutral-500";

  return (
    <div className="bg-white rounded-md border border-neutral-200 p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-bold text-neutral-900">{dateStr}</span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 uppercase">
            {lang === "pt" ? typeInfo.pt : typeInfo.en}
          </span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${outcomeInfo.color}`}>
            {lang === "pt" ? outcomeInfo.pt : outcomeInfo.en}
          </span>
          {meeting.mood && (
            <span className="text-[12px]" title={meeting.mood}>{MOOD_EMOJI[meeting.mood] || ""}</span>
          )}
          <span className={`inline-flex items-center gap-0.5 ${tierColor}`} title={meeting.confidentiality}>
            <TierIcon size={10} />
          </span>
          {meeting.source === "onenote_import" && (
            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded uppercase">
              OneNote
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={onEdit} className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-900" title={lang === "pt" ? "Editar" : "Edit"}>
            <Edit3 size={12} />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 text-neutral-400 hover:text-red-600" title={lang === "pt" ? "Remover" : "Delete"}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {meeting.agenda && (
        <p className="text-[12px] font-semibold text-neutral-800 mb-0.5">{meeting.agenda}</p>
      )}
      {meeting.summary && (
        <p className="text-[11px] text-neutral-700 leading-relaxed line-clamp-3">{meeting.summary}</p>
      )}
      {meeting.next_steps && (
        <p className="text-[11px] text-neutral-500 mt-1">
          <span className="font-bold">{lang === "pt" ? "Próximos: " : "Next: "}</span>
          {meeting.next_steps}
        </p>
      )}
      {(meeting.competitor_tech.length > 0 || meeting.service_interest.length > 0) && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {meeting.competitor_tech.map((t) => (
            <span key={"t-" + t} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">{t}</span>
          ))}
          {meeting.service_interest.map((s) => (
            <span key={"s-" + s} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function CnpjInline({ cnpj, raw, publicUrl, lang }: { cnpj: string; raw: string; publicUrl: string | null; lang: Lang }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* no-op */ }
  };
  return (
    <div className="inline-flex items-center gap-1 text-[11px] font-mono text-neutral-600">
      <span>{cnpj}</span>
      <button
        type="button"
        onClick={copy}
        className="p-0.5 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-800"
        title={lang === "pt" ? "Copiar CNPJ" : "Copy CNPJ"}
      >
        {copied ? <Check size={10} className="text-emerald-600" /> : <Copy size={10} />}
      </button>
      {publicUrl && (
        <a
          href={publicUrl}
          onClick={(e) => e.stopPropagation()}
          target="_blank"
          rel="noopener noreferrer"
          className="p-0.5 rounded hover:bg-neutral-100 text-neutral-400 hover:text-purple-600"
          title={lang === "pt" ? "Abrir em cnpj.biz" : "Open on cnpj.biz"}
        >
          <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}

function SortButton({
  label, field, activeField, activeDir, onClick,
}: {
  label: string;
  field: string;
  activeField: string;
  activeDir: "asc" | "desc";
  onClick: () => void;
}) {
  const active = field === activeField;
  const Icon = !active ? ArrowUpDown : activeDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-0.5 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
        active
          ? "bg-purple-100 text-purple-800 border border-purple-300"
          : "text-neutral-600 hover:bg-neutral-100 border border-transparent"
      }`}
    >
      <Icon size={10} />
      {label}
    </button>
  );
}

function FilterInput({
  label, value, onChange, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1 tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-purple-400"
      />
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase font-bold text-neutral-500 mb-1 tracking-wider">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-purple-400"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
