"use client";

/**
 * MeetingFormModal — full-fidelity "Registrar Reunião" form.
 *
 * Captures the rich fields that the OneNote importer was already
 * storing in meetings.metadata (competitor_tech, service_interest,
 * financial_info, plans, mood) plus the structured core fields
 * (date, type, attendees, outcome, summary, next_steps,
 * confidentiality). Used from:
 *
 *   - EntityCrmPanel "Registrar" button (mode=create, entity fixed)
 *   - EntityCrmPanel edit icon         (mode=edit, meeting supplied)
 *   - MeetingsLog edit action          (mode=edit, entity + meeting supplied)
 *
 * Writes go to POST /api/crm/meetings (create) or
 * PATCH /api/crm/meetings?id=... (update). Metadata PATCHes merge
 * server-side (see meetings/route.ts) so partial edits are safe.
 */

import { useEffect, useState } from "react";
import { Lang } from "@/lib/i18n";
import {
  Loader2, Save, X, Plus, Calendar, AlertTriangle, Lock, Globe, Check,
  Building2, Search, RefreshCw, Store, Factory,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCnpj } from "@/lib/cnpj";

export interface MeetingRecord {
  id?: string;
  entity_uid: string;
  meeting_date: string;
  meeting_type: string;
  attendees: string[] | null;
  agenda: string | null;
  summary: string | null;
  next_steps: string | null;
  outcome: string;
  source?: string;
  confidentiality?: string;
  metadata?: {
    competitor_tech?: string[];
    service_interest?: string[];
    financial_info?: string | null;
    plans?: string | null;
    mood?: string | null;
    [k: string]: any;
  } | null;
}

const MEETING_TYPES = ["comercial", "tecnica", "prospeccao", "followup", "contrato", "outro"] as const;
const OUTCOMES = ["pending", "positive", "neutral", "negative"] as const;
const MOODS = ["excited", "positive", "neutral", "cautious", "negative"] as const;
const TIERS = ["agrisafe_confidential", "agrisafe_published", "public"] as const;

const LABELS = {
  type: {
    comercial:  { pt: "Comercial",    en: "Commercial" },
    tecnica:    { pt: "Técnica",      en: "Technical" },
    prospeccao: { pt: "Prospecção",   en: "Prospecting" },
    followup:   { pt: "Follow-up",    en: "Follow-up" },
    contrato:   { pt: "Contrato",     en: "Contract" },
    outro:      { pt: "Outro",        en: "Other" },
  },
  outcome: {
    pending:  { pt: "Pendente", en: "Pending",  color: "bg-neutral-100 text-neutral-600" },
    positive: { pt: "Positivo", en: "Positive", color: "bg-emerald-100 text-emerald-700" },
    neutral:  { pt: "Neutro",   en: "Neutral",  color: "bg-neutral-100 text-neutral-700" },
    negative: { pt: "Negativo", en: "Negative", color: "bg-red-100 text-red-700" },
  },
  mood: {
    excited:  { pt: "Entusiasmado", en: "Excited",  emoji: "🔥" },
    positive: { pt: "Positivo",     en: "Positive", emoji: "🙂" },
    neutral:  { pt: "Neutro",       en: "Neutral",  emoji: "😐" },
    cautious: { pt: "Cauteloso",    en: "Cautious", emoji: "🤔" },
    negative: { pt: "Negativo",     en: "Negative", emoji: "☹️" },
  },
  tier: {
    agrisafe_confidential: { pt: "Confidencial",         en: "Confidential",   icon: Lock },
    agrisafe_published:    { pt: "Publicável",           en: "Publishable",    icon: Globe },
    public:                { pt: "Público",              en: "Public",         icon: Globe },
  },
} as const;

export function MeetingFormModal({
  lang,
  entityUid: initialEntityUid,
  entityName: initialEntityName,
  entityTaxId: initialEntityTaxId,
  meeting,
  suggestedTech,
  suggestedService,
  onClose,
  onSaved,
}: {
  lang: Lang;
  entityUid: string;
  entityName?: string | null;
  entityTaxId?: string | null;
  meeting?: MeetingRecord | null;
  suggestedTech?: string[];
  suggestedService?: string[];
  onClose: () => void;
  onSaved: (meeting: MeetingRecord) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isEdit = !!meeting?.id;

  const [entityUid, setEntityUid] = useState(initialEntityUid);
  const [entityName, setEntityName] = useState<string | null>(initialEntityName || null);
  const [entityTaxId, setEntityTaxId] = useState<string | null>(initialEntityTaxId || null);
  const entityChanged = entityUid !== initialEntityUid;

  const [date, setDate] = useState(meeting?.meeting_date || today);
  const [type, setType] = useState(meeting?.meeting_type || "comercial");
  const [outcome, setOutcome] = useState(meeting?.outcome || "pending");
  const [agenda, setAgenda] = useState(meeting?.agenda || "");
  const [summary, setSummary] = useState(meeting?.summary || "");
  const [nextSteps, setNextSteps] = useState(meeting?.next_steps || "");
  const [attendees, setAttendees] = useState<string[]>(meeting?.attendees || []);
  const [attendeeInput, setAttendeeInput] = useState("");

  const [mood, setMood] = useState<string>(meeting?.metadata?.mood || "");
  const [competitorTech, setCompetitorTech] = useState<string[]>(meeting?.metadata?.competitor_tech || []);
  const [techInput, setTechInput] = useState("");
  const [serviceInterest, setServiceInterest] = useState<string[]>(meeting?.metadata?.service_interest || []);
  const [serviceInput, setServiceInput] = useState("");
  const [financialInfo, setFinancialInfo] = useState(meeting?.metadata?.financial_info || "");
  const [plans, setPlans] = useState(meeting?.metadata?.plans || "");
  const [tier, setTier] = useState(meeting?.confidentiality || "agrisafe_confidential");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const addChip = (list: string[], setList: (l: string[]) => void, raw: string, setInput: (v: string) => void) => {
    const v = raw.trim().toLowerCase();
    if (!v) return;
    if (list.includes(v)) { setInput(""); return; }
    setList([...list, v]);
    setInput("");
  };
  const removeChip = (list: string[], setList: (l: string[]) => void, v: string) => {
    setList(list.filter((x) => x !== v));
  };

  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      const metadata: Record<string, any> = {};
      if (mood) metadata.mood = mood; else metadata.mood = null;
      metadata.competitor_tech = competitorTech;
      metadata.service_interest = serviceInterest;
      metadata.financial_info = financialInfo.trim() || null;
      metadata.plans = plans.trim() || null;

      const body: Record<string, any> = {
        entity_uid: entityUid,
        meeting_date: date,
        meeting_type: type,
        outcome,
        agenda: agenda.trim() || null,
        summary: summary.trim() || null,
        next_steps: nextSteps.trim() || null,
        attendees: attendees.length > 0 ? attendees : null,
        confidentiality: tier,
        metadata,
      };
      // When editing, ensure reassignment is persisted even if the user
      // also edited other metadata (PATCH endpoint already merges metadata).
      if (isEdit && !entityChanged) {
        // Drop entity_uid from body on edit if it didn't change — not
        // strictly required, but cleaner activity_log output.
        delete body.entity_uid;
      }

      const url = isEdit
        ? `/api/crm/meetings?id=${meeting!.id}`
        : "/api/crm/meetings";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onSaved(data.meeting || { ...body, id: meeting?.id });
    } catch (e: any) {
      setErr(e.message);
    }
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-purple-100 flex items-center justify-center">
              <Calendar size={14} className="text-purple-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-neutral-900">
                {isEdit
                  ? (lang === "pt" ? "Editar Reunião" : "Edit Meeting")
                  : (lang === "pt" ? "Registrar Reunião" : "Log Meeting")}
              </h3>
              {entityName && (
                <p className="text-[11px] text-neutral-500">{entityName}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-neutral-100 text-neutral-500">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Entity — always shown, reassignable in edit mode */}
          <EntityReassignBlock
            lang={lang}
            entityUid={entityUid}
            entityName={entityName}
            entityTaxId={entityTaxId}
            initialEntityUid={initialEntityUid}
            allowChange={isEdit}
            onPick={(uid, name, taxId) => {
              setEntityUid(uid);
              setEntityName(name);
              setEntityTaxId(taxId);
            }}
          />

          {/* Visibility banner — prominent, reflects current tier */}
          <VisibilityBanner lang={lang} tier={tier} onChange={setTier} />

          {/* Core: date + type + outcome */}
          <div className="grid grid-cols-3 gap-3">
            <Field label={lang === "pt" ? "Data" : "Date"}>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-purple-400"
              />
            </Field>
            <Field label={lang === "pt" ? "Tipo" : "Type"}>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-purple-400"
              >
                {MEETING_TYPES.map((t) => (
                  <option key={t} value={t}>{lang === "pt" ? LABELS.type[t].pt : LABELS.type[t].en}</option>
                ))}
              </select>
            </Field>
            <Field label={lang === "pt" ? "Desfecho" : "Outcome"}>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-purple-400"
              >
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>{lang === "pt" ? LABELS.outcome[o].pt : LABELS.outcome[o].en}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Agenda */}
          <Field label={lang === "pt" ? "Pauta / Assunto" : "Agenda / Subject"}>
            <input
              type="text"
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder={lang === "pt" ? "Ex: Apresentação da plataforma + dúvidas sobre SCR" : "e.g. Platform demo + SCR questions"}
              className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-purple-400"
            />
          </Field>

          {/* Attendees chips */}
          <Field label={lang === "pt" ? "Participantes" : "Attendees"}>
            <div className="flex flex-wrap gap-1.5 items-center p-1.5 border border-neutral-300 rounded bg-white min-h-[32px]">
              {attendees.map((a) => (
                <Chip key={a} label={a} onRemove={() => removeChip(attendees, setAttendees, a)} color="neutral" />
              ))}
              <input
                type="text"
                value={attendeeInput}
                onChange={(e) => setAttendeeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addChip(attendees, setAttendees, attendeeInput, setAttendeeInput);
                  }
                  if (e.key === "Backspace" && !attendeeInput && attendees.length > 0) {
                    setAttendees(attendees.slice(0, -1));
                  }
                }}
                placeholder={lang === "pt" ? "Adicionar nome + Enter" : "Add name + Enter"}
                className="flex-1 min-w-[140px] text-[12px] focus:outline-none"
              />
            </div>
          </Field>

          {/* Summary + next steps */}
          <Field label={lang === "pt" ? "Resumo da reunião" : "Meeting summary"}>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder={lang === "pt" ? "O que foi discutido, decisões, pontos relevantes..." : "What was discussed, decisions, relevant points..."}
              className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-purple-400 leading-relaxed"
            />
          </Field>

          <Field label={lang === "pt" ? "Próximos passos" : "Next steps"}>
            <textarea
              value={nextSteps}
              onChange={(e) => setNextSteps(e.target.value)}
              rows={2}
              placeholder={lang === "pt" ? "Ações combinadas, responsáveis, prazos..." : "Agreed actions, owners, deadlines..."}
              className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-purple-400 leading-relaxed"
            />
          </Field>

          {/* Mood */}
          <Field label={lang === "pt" ? "Mood da reunião" : "Meeting mood"}>
            <div className="flex flex-wrap gap-1.5">
              {MOODS.map((m) => {
                const info = LABELS.mood[m];
                const active = mood === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMood(active ? "" : m)}
                    className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                      active
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-white text-neutral-700 border-neutral-300 hover:border-purple-300"
                    }`}
                  >
                    <span>{info.emoji}</span>
                    {lang === "pt" ? info.pt : info.en}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Competitor tech chips */}
          <Field
            label={lang === "pt" ? "Tecnologias / concorrentes mencionados" : "Competitor tech mentioned"}
            hint={lang === "pt" ? "Ex: serasa, scr, datarking, boa vista" : "e.g. serasa, scr, datarking"}
          >
            <ChipInput
              values={competitorTech}
              onAdd={(v) => addChip(competitorTech, setCompetitorTech, v, setTechInput)}
              onRemove={(v) => removeChip(competitorTech, setCompetitorTech, v)}
              input={techInput}
              setInput={setTechInput}
              color="amber"
              suggestions={suggestedTech}
              placeholder={lang === "pt" ? "Adicionar tag + Enter" : "Add tag + Enter"}
            />
          </Field>

          {/* Service interest chips */}
          <Field
            label={lang === "pt" ? "Serviços de interesse" : "Service interest"}
            hint={lang === "pt" ? "Ex: credit_intelligence, monitoring, collection, market_hub_access" : "e.g. credit_intelligence, monitoring"}
          >
            <ChipInput
              values={serviceInterest}
              onAdd={(v) => addChip(serviceInterest, setServiceInterest, v, setServiceInput)}
              onRemove={(v) => removeChip(serviceInterest, setServiceInterest, v)}
              input={serviceInput}
              setInput={setServiceInput}
              color="emerald"
              suggestions={suggestedService}
              placeholder={lang === "pt" ? "Adicionar tag + Enter" : "Add tag + Enter"}
            />
          </Field>

          {/* Plans + financial info */}
          <Field label={lang === "pt" ? "Planos / roadmap do cliente" : "Client plans / roadmap"}>
            <textarea
              value={plans}
              onChange={(e) => setPlans(e.target.value)}
              rows={2}
              placeholder={lang === "pt" ? "Expansão, novas safras, investimentos planejados..." : "Expansion, new crops, planned investments..."}
              className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-purple-400"
            />
          </Field>

          <Field label={lang === "pt" ? "Informações financeiras / comerciais" : "Financial / commercial info"}>
            <textarea
              value={financialInfo}
              onChange={(e) => setFinancialInfo(e.target.value)}
              rows={2}
              placeholder={lang === "pt" ? "Faturamento, estrutura, fornecedores..." : "Revenue, structure, suppliers..."}
              className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-purple-400"
            />
          </Field>

          {err && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded text-[12px] text-red-700 flex items-center gap-2">
              <AlertTriangle size={13} /> {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[12px] font-medium text-neutral-700 hover:bg-neutral-100 rounded"
          >
            {lang === "pt" ? "Cancelar" : "Cancel"}
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 bg-purple-600 text-white text-[12px] font-bold rounded hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving
              ? (lang === "pt" ? "Salvando..." : "Saving...")
              : isEdit
                ? (lang === "pt" ? "Salvar" : "Save")
                : (lang === "pt" ? "Registrar" : "Log")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Visibility banner ──────────────────────────────────────────────

function VisibilityBanner({
  lang, tier, onChange,
}: {
  lang: Lang;
  tier: string;
  onChange: (t: string) => void;
}) {
  const options = [
    {
      value: "agrisafe_confidential",
      label: lang === "pt" ? "Confidencial" : "Confidential",
      icon: Lock,
      bg: "bg-purple-600",
      ring: "ring-purple-600",
      tint: "bg-purple-50 border-purple-200",
      tintActive: "bg-purple-100 border-purple-400",
      summary: lang === "pt"
        ? "Visível APENAS no Log de Reuniões. Não aparece no Diretório de Canais nem no de Indústrias."
        : "Visible ONLY in the Meetings Log. Hidden from the Channels and Industries directories.",
      audiences: [
        { label: lang === "pt" ? "Log de Reuniões" : "Meetings Log", on: true },
        { label: lang === "pt" ? "Diretório de Canais" : "Channels Directory", on: false },
        { label: lang === "pt" ? "Diretório de Indústrias" : "Industries Directory", on: false },
        { label: lang === "pt" ? "Público" : "Public / clients", on: false },
      ],
    },
    {
      value: "agrisafe_published",
      label: lang === "pt" ? "Publicável" : "Publishable",
      icon: Globe,
      bg: "bg-brand-primary",
      ring: "ring-brand-primary",
      tint: "bg-emerald-50 border-emerald-200",
      tintActive: "bg-emerald-100 border-emerald-400",
      summary: lang === "pt"
        ? "Aparece também no CRM AgriSafe dentro do Diretório de Canais e do Diretório de Indústrias (para parceiros autenticados)."
        : "Also appears in the AgriSafe CRM panel of the Channels and Industries directories (authenticated partners).",
      audiences: [
        { label: lang === "pt" ? "Log de Reuniões" : "Meetings Log", on: true },
        { label: lang === "pt" ? "Diretório de Canais" : "Channels Directory", on: true },
        { label: lang === "pt" ? "Diretório de Indústrias" : "Industries Directory", on: true },
        { label: lang === "pt" ? "Público" : "Public / clients", on: false },
      ],
    },
    {
      value: "public",
      label: lang === "pt" ? "Público" : "Public",
      icon: Globe,
      bg: "bg-neutral-800",
      ring: "ring-neutral-800",
      tint: "bg-neutral-50 border-neutral-200",
      tintActive: "bg-neutral-200 border-neutral-500",
      summary: lang === "pt"
        ? "Uso raro: aparece em todos os contextos, inclusive feeds de terceiros e clientes sem autenticação."
        : "Rare: appears in all contexts including public feeds and unauthenticated views.",
      audiences: [
        { label: lang === "pt" ? "Log de Reuniões" : "Meetings Log", on: true },
        { label: lang === "pt" ? "Diretório de Canais" : "Channels Directory", on: true },
        { label: lang === "pt" ? "Diretório de Indústrias" : "Industries Directory", on: true },
        { label: lang === "pt" ? "Público" : "Public / clients", on: true },
      ],
    },
  ];

  const active = options.find((o) => o.value === tier) || options[0];

  return (
    <div className={`rounded-md border p-3 ${active.tint}`}>
      <div className="flex items-center gap-2 mb-2">
        <active.icon size={13} className="text-neutral-700" />
        <p className="text-[11px] uppercase font-bold text-neutral-700 tracking-wider">
          {lang === "pt" ? "Visibilidade desta reunião" : "Visibility of this meeting"}
        </p>
      </div>

      {/* Tier pills */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        {options.map((o) => {
          const isActive = o.value === tier;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`inline-flex items-center justify-center gap-1.5 text-[11px] font-medium px-2 py-1.5 rounded border transition-colors ${
                isActive
                  ? `${o.bg} text-white border-transparent`
                  : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
              }`}
            >
              <o.icon size={11} />
              {o.label}
            </button>
          );
        })}
      </div>

      {/* Audience matrix — crystal-clear statement */}
      <p className="text-[11px] text-neutral-700 leading-relaxed mb-2">
        {active.summary}
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        {active.audiences.map((a) => (
          <span key={a.label} className="inline-flex items-center gap-1">
            {a.on
              ? <Check size={11} className="text-emerald-600" />
              : <X size={11} className="text-neutral-400" />}
            <span className={a.on ? "text-neutral-800 font-medium" : "text-neutral-400 line-through"}>
              {a.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Entity reassignment block ──────────────────────────────────────

function EntityReassignBlock({
  lang, entityUid, entityName, entityTaxId, initialEntityUid, allowChange, onPick,
}: {
  lang: Lang;
  entityUid: string;
  entityName: string | null;
  entityTaxId: string | null;
  initialEntityUid: string;
  allowChange: boolean;
  onPick: (uid: string, name: string | null, taxId: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ entity_uid: string; display_name: string | null; legal_name: string | null; tax_id: string | null }>>([]);
  const [searching, setSearching] = useState(false);

  // "Create new entity by CNPJ" sub-flow
  const [createOpen, setCreateOpen] = useState(false);
  const [createRole, setCreateRole] = useState<"retailer" | "industry">("industry");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createdNotice, setCreatedNotice] = useState<string | null>(null);

  // Resolve display name + tax_id when we don't have them (e.g. first open)
  useEffect(() => {
    if (entityName && entityTaxId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("legal_entities")
        .select("display_name, legal_name, tax_id")
        .eq("entity_uid", entityUid)
        .maybeSingle();
      if (!cancelled && data) {
        onPick(entityUid, data.display_name || data.legal_name, data.tax_id);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityUid]);

  const runSearch = async (q: string) => {
    setQuery(q);
    setCreateErr(null);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const esc = q.replace(/[%_]/g, "\\$&");
      const digits = q.replace(/\D/g, "");
      const parts = [
        `display_name.ilike.%${esc}%`,
        `legal_name.ilike.%${esc}%`,
      ];
      if (digits.length >= 4) parts.push(`tax_id.ilike.%${digits.slice(0, 8)}%`);
      const { data } = await supabase
        .from("legal_entities")
        .select("entity_uid, display_name, legal_name, tax_id")
        .or(parts.join(","))
        .limit(10);
      setResults(data || []);
    } finally {
      setSearching(false);
    }
  };

  const queryDigits = query.replace(/\D/g, "");
  const looksLikeCnpj = queryDigits.length >= 8 && queryDigits.length <= 14;
  const noResults = !searching && query.trim().length >= 2 && results.length === 0;

  const submitCreate = async () => {
    if (!looksLikeCnpj) return;
    setCreating(true);
    setCreateErr(null);
    try {
      const res = await fetch("/api/crm/entity-from-cnpj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj: queryDigits, role_type: createRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const cnpjRoot = queryDigits.length === 14
        ? queryDigits.slice(0, 8)
        : queryDigits.padStart(8, "0").slice(0, 8);
      onPick(data.entity_uid, data.display_name || data.legal_name, cnpjRoot);

      // Banner — explicit, includes which directory got the new row
      const directory = createRole === "industry"
        ? (lang === "pt" ? "Diretório de Indústrias" : "Industries Directory")
        : (lang === "pt" ? "Diretório de Canais" : "Channels Directory");
      const wasCreated = data.created?.industry || data.created?.retailer;
      setCreatedNotice(
        wasCreated
          ? (lang === "pt"
              ? `Empresa criada e adicionada ao ${directory}.`
              : `Company created and added to the ${directory}.`)
          : (lang === "pt"
              ? `Empresa já existia no ${directory} — vinculada à reunião.`
              : `Company already existed in the ${directory} — linked to this meeting.`),
      );

      setCreateOpen(false);
      setEditing(false);
      setQuery("");
      setResults([]);
    } catch (e: any) {
      setCreateErr(e.message);
    } finally {
      setCreating(false);
    }
  };

  const changed = entityUid !== initialEntityUid;

  return (
    <div className={`rounded-md border p-3 ${changed ? "bg-purple-50 border-purple-300" : "bg-neutral-50 border-neutral-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <label className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-neutral-500 mb-1 tracking-wider">
            <Building2 size={11} />
            {lang === "pt" ? "Empresa vinculada" : "Linked company"}
            {changed && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-600 text-white normal-case tracking-normal">
                {lang === "pt" ? "REATRIBUÍDA" : "REASSIGNED"}
              </span>
            )}
          </label>
          <p className="text-[13px] font-bold text-neutral-900 truncate">{entityName || "—"}</p>
          <p className="text-[11px] font-mono text-neutral-500">
            {entityTaxId ? formatCnpj(entityTaxId) : entityUid.slice(0, 8) + "…"}
          </p>
        </div>
        {allowChange && (
          <button
            type="button"
            onClick={() => { setEditing(!editing); setQuery(""); setResults([]); }}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-white border border-purple-300 rounded px-2 py-1 hover:bg-purple-100"
          >
            <RefreshCw size={11} />
            {lang === "pt" ? "Reatribuir" : "Reassign"}
          </button>
        )}
      </div>

      {createdNotice && (
        <div className="mt-3 p-2 bg-emerald-50 border border-emerald-300 rounded text-[11px] text-emerald-800 flex items-start gap-1.5">
          <Check size={12} className="text-emerald-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-bold">{createdNotice}</p>
            <p className="text-[10px] text-emerald-700 mt-0.5">
              {lang === "pt"
                ? "A empresa já está disponível na busca e nos diretórios."
                : "The company is now available in search and directories."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreatedNotice(null)}
            className="text-emerald-600 hover:text-emerald-900"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {editing && (
        <div className="mt-3 pt-3 border-t border-purple-200 space-y-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              placeholder={lang === "pt" ? "Buscar por razão social, nome ou CNPJ (8 dígitos)..." : "Search by legal name, display name or CNPJ root..."}
              className="w-full pl-7 pr-3 py-1.5 text-[12px] border border-neutral-300 rounded focus:outline-none focus:border-purple-400"
              autoFocus
            />
            {searching && <Loader2 size={11} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-neutral-400" />}
          </div>

          {results.length > 0 && (
            <div className="max-h-[200px] overflow-y-auto space-y-1 bg-white rounded border border-neutral-200">
              {results.map((r) => (
                <button
                  key={r.entity_uid}
                  type="button"
                  onClick={() => {
                    onPick(r.entity_uid, r.display_name || r.legal_name, r.tax_id);
                    setEditing(false);
                    setQuery("");
                    setResults([]);
                  }}
                  className="w-full text-left px-2 py-1.5 hover:bg-purple-50 border-b border-neutral-100 last:border-b-0"
                >
                  <p className="text-[12px] font-semibold text-neutral-900">
                    {r.display_name || r.legal_name || "—"}
                  </p>
                  <p className="text-[10px] text-neutral-500 font-mono">
                    {r.tax_id ? formatCnpj(r.tax_id) : r.entity_uid.slice(0, 8) + "…"}
                    {r.legal_name && r.display_name && r.legal_name !== r.display_name && (
                      <span className="ml-2 text-neutral-400 font-sans">· {r.legal_name}</span>
                    )}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* Empty state CTA — search returned nothing and create form is closed */}
          {noResults && !createOpen && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5">
              <p className="text-[11px] text-amber-800 mb-1.5">
                {lang === "pt"
                  ? "Nenhuma empresa encontrada para essa busca."
                  : "No company matches that search."}
              </p>
              {looksLikeCnpj ? (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 px-2.5 py-1 rounded"
                >
                  <Plus size={11} />
                  {lang === "pt"
                    ? `Criar empresa pelo CNPJ ${formatCnpj(queryDigits.padStart(8, "0").slice(0, 8))}`
                    : `Create company from CNPJ ${formatCnpj(queryDigits.padStart(8, "0").slice(0, 8))}`}
                </button>
              ) : (
                <p className="text-[10px] text-amber-700 italic">
                  {lang === "pt"
                    ? "Digite um CNPJ (8 a 14 dígitos) para criar uma empresa nova."
                    : "Type a CNPJ (8–14 digits) to create a new company."}
                </p>
              )}
            </div>
          )}

          {/* Inline "create new" form — role chooser + confirm */}
          {createOpen && (
            <div className="rounded-md bg-amber-50 border border-amber-300 p-3 space-y-2">
              <p className="text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
                <Plus size={11} />
                {lang === "pt"
                  ? `Criar nova empresa — CNPJ ${formatCnpj(queryDigits.length === 14 ? queryDigits : queryDigits.padStart(8, "0").slice(0, 8))}`
                  : `Create new company — CNPJ ${formatCnpj(queryDigits.length === 14 ? queryDigits : queryDigits.padStart(8, "0").slice(0, 8))}`}
              </p>
              <p className="text-[10px] text-amber-800">
                {lang === "pt"
                  ? "Escolha o tipo. A empresa será automaticamente adicionada ao diretório correspondente:"
                  : "Pick the role. The company will be auto-added to the matching directory:"}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCreateRole("retailer")}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-medium px-2 py-1.5 rounded border ${
                    createRole === "retailer"
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                  }`}
                >
                  <Store size={11} />
                  {lang === "pt" ? "Revenda / Canal → Diretório de Canais" : "Retailer → Channels Directory"}
                </button>
                <button
                  type="button"
                  onClick={() => setCreateRole("industry")}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-medium px-2 py-1.5 rounded border ${
                    createRole === "industry"
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400"
                  }`}
                >
                  <Factory size={11} />
                  {lang === "pt" ? "Indústria → Diretório de Indústrias" : "Industry → Industries Directory"}
                </button>
              </div>

              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-white border border-amber-200 text-[10px] text-neutral-700">
                <AlertTriangle size={11} className="text-amber-600 shrink-0" />
                <span>
                  {lang === "pt"
                    ? <>Será adicionada uma nova entrada ao <b>{createRole === "industry" ? "Diretório de Indústrias" : "Diretório de Canais"}</b> (Receita Federal via BrasilAPI). Você poderá enriquecer os dados depois.</>
                    : <>A new row will be added to the <b>{createRole === "industry" ? "Industries Directory" : "Channels Directory"}</b> (Receita Federal via BrasilAPI). You can enrich it later.</>}
                </span>
              </div>

              {createErr && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-[11px] text-red-700 flex items-center gap-1.5">
                  <AlertTriangle size={11} /> {createErr}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setCreateOpen(false); setCreateErr(null); }}
                  disabled={creating}
                  className="px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-100 rounded"
                >
                  {lang === "pt" ? "Cancelar" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={submitCreate}
                  disabled={creating}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-amber-600 text-white text-[11px] font-bold rounded hover:bg-amber-700 disabled:opacity-50"
                >
                  {creating ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  {creating
                    ? (lang === "pt" ? "Criando..." : "Creating...")
                    : (lang === "pt" ? "Criar e Vincular" : "Create & Link")}
                </button>
              </div>
            </div>
          )}

          {/* Quick-create CTA outside the empty state — when user typed a CNPJ but
              we DID find unrelated results, give them an explicit way to bypass. */}
          {looksLikeCnpj && results.length > 0 && !createOpen && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 underline"
            >
              {lang === "pt"
                ? `Nenhuma destas? Criar empresa nova pelo CNPJ ${formatCnpj(queryDigits.padStart(8, "0").slice(0, 8))}`
                : `None of these? Create a new company from CNPJ ${formatCnpj(queryDigits.padStart(8, "0").slice(0, 8))}`}
            </button>
          )}

          <p className="text-[10px] text-neutral-500">
            {lang === "pt"
              ? "A reunião ficará vinculada à empresa escolhida (ou criada) ao salvar."
              : "The meeting will be linked to the chosen (or newly created) company on save."}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-[11px] uppercase font-bold text-neutral-500 mb-1 tracking-wider">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-neutral-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function Chip({
  label, onRemove, color,
}: {
  label: string;
  onRemove: () => void;
  color: "neutral" | "amber" | "emerald";
}) {
  const colorClass = {
    neutral: "bg-neutral-100 text-neutral-700 border-neutral-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
  }[color];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${colorClass}`}>
      {label}
      <button type="button" onClick={onRemove} className="opacity-60 hover:opacity-100">
        <X size={10} />
      </button>
    </span>
  );
}

function ChipInput({
  values, onAdd, onRemove, input, setInput, color, suggestions, placeholder,
}: {
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  input: string;
  setInput: (v: string) => void;
  color: "amber" | "emerald";
  suggestions?: string[];
  placeholder: string;
}) {
  const available = (suggestions || []).filter((s) => !values.includes(s)).slice(0, 8);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5 items-center p-1.5 border border-neutral-300 rounded bg-white min-h-[32px]">
        {values.map((v) => (
          <Chip key={v} label={v} onRemove={() => onRemove(v)} color={color} />
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              onAdd(input);
            }
            if (e.key === "Backspace" && !input && values.length > 0) {
              onRemove(values[values.length - 1]);
            }
          }}
          placeholder={placeholder}
          className="flex-1 min-w-[140px] text-[12px] focus:outline-none"
        />
      </div>
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {available.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onAdd(s)}
              className="inline-flex items-center gap-0.5 text-[10px] text-neutral-500 hover:text-neutral-900 px-1.5 py-0.5 rounded bg-neutral-50 border border-neutral-200 hover:border-neutral-400"
            >
              <Plus size={9} /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
