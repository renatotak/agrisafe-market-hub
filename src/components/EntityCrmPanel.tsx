"use client";

/**
 * Phase 24G — EntityCrmPanel.
 *
 * Reusable CRM panel that hangs off any expanded row in the directories
 * (RetailersDirectory or IndustriesDirectory). Takes an `entity_uid` and
 * renders three sections: Key Persons / Meetings / Leads.
 *
 * All three sections hit /api/crm/* CRUD endpoints. Reads default to
 * the entity-scoped lists; writes go through small inline add forms
 * with sane defaults so the user can capture a new contact / meeting
 * note / lead in 2-3 keystrokes.
 *
 * Confidentiality: every row inserted from this panel inherits the
 * `agrisafe_confidential` default from the table. The migration 040
 * + chat tier filter make sure these never leak into a `public`-tier
 * RAG response.
 */

import { useEffect, useState } from "react";
import { Lang } from "@/lib/i18n";
import {
  Users, CalendarDays, Target, Plus, Loader2, Trash2, Save, X, Lock, ChevronDown, ChevronUp, Edit3,
} from "lucide-react";
import { MeetingFormModal, type MeetingRecord } from "@/components/MeetingFormModal";
import { SimilarTargetsSection } from "@/components/SimilarTargetsSection";
import { ChatInbox } from "@/components/ChatInbox";
import { supabase } from "@/lib/supabase";

interface KeyPerson {
  id: string;
  full_name: string;
  role_title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  linkedin_url: string | null;
  notes: string | null;
  is_decision_maker: boolean;
  is_gatekeeper: boolean;
}

interface Meeting {
  id: string;
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
    mood?: string | null;
    plans?: string | null;
  } | null;
}

const MOOD_EMOJI: Record<string, string> = {
  excited: "🔥", positive: "🙂", neutral: "😐", cautious: "🤔", negative: "☹️",
};

interface Lead {
  id: string;
  stage: string;
  service_interest: string | null;
  estimated_value_brl: number | null;
  probability_pct: number | null;
  expected_close_date: string | null;
  source: string;
  notes: string | null;
  owner: string | null;
}

const STAGE_LABELS: Record<string, { pt: string; en: string; color: string }> = {
  new:         { pt: "Novo",         en: "New",         color: "bg-neutral-100 text-neutral-700" },
  qualified:   { pt: "Qualificado",  en: "Qualified",   color: "bg-blue-100 text-blue-700" },
  proposal:    { pt: "Proposta",     en: "Proposal",    color: "bg-indigo-100 text-indigo-700" },
  negotiation: { pt: "Negociação",   en: "Negotiation", color: "bg-amber-100 text-amber-700" },
  won:         { pt: "Ganho",        en: "Won",         color: "bg-emerald-100 text-emerald-700" },
  lost:        { pt: "Perdido",      en: "Lost",        color: "bg-red-100 text-red-700" },
  dormant:     { pt: "Dormente",     en: "Dormant",     color: "bg-neutral-200 text-neutral-500" },
};

const OUTCOME_LABELS: Record<string, { pt: string; en: string; color: string }> = {
  pending:  { pt: "Pendente", en: "Pending",  color: "bg-neutral-100 text-neutral-600" },
  positive: { pt: "Positivo", en: "Positive", color: "bg-emerald-100 text-emerald-700" },
  neutral:  { pt: "Neutro",   en: "Neutral",  color: "bg-neutral-100 text-neutral-700" },
  negative: { pt: "Negativo", en: "Negative", color: "bg-red-100 text-red-700" },
};

const MEETING_TYPE_LABELS: Record<string, { pt: string; en: string }> = {
  comercial:   { pt: "Comercial",    en: "Commercial" },
  tecnica:     { pt: "Técnica",      en: "Technical" },
  prospeccao:  { pt: "Prospecção",   en: "Prospecting" },
  followup:    { pt: "Follow-up",    en: "Follow-up" },
  contrato:    { pt: "Contrato",     en: "Contract" },
  outro:       { pt: "Outro",        en: "Other" },
};

function fmtBRL(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)} mi`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)} mil`;
  return `R$ ${v.toFixed(0)}`;
}

export function EntityCrmPanel({
  entityUid,
  lang,
}: {
  entityUid: string | null | undefined;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);

  if (!entityUid) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-[11px] text-amber-700">
        {lang === "pt"
          ? "CRM disponível apenas para entidades vinculadas (entity_uid)."
          : "CRM is only available for entities linked to legal_entities (entity_uid)."}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-purple-50 border-b border-purple-100 hover:bg-purple-100/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Lock size={12} className="text-purple-600" />
          <span className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">
            CRM AgriSafe
          </span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
            {lang === "pt" ? "confidencial" : "confidential"}
          </span>
        </div>
        {open ? <ChevronUp size={14} className="text-purple-600" /> : <ChevronDown size={14} className="text-purple-600" />}
      </button>

      {open && (
        <div className="p-4 space-y-5">
          <ChatSection entityUid={entityUid} lang={lang} />
          <KeyPersonsSection entityUid={entityUid} lang={lang} />
          <MeetingsSection entityUid={entityUid} lang={lang} />
          <LeadsSection entityUid={entityUid} lang={lang} />
          <SimilarTargetsSection entityUid={entityUid} lang={lang} />
        </div>
      )}
    </div>
  );
}

// ─── Chat section ───────────────────────────────────────────────────────────

function ChatSection({ entityUid, lang }: { entityUid: string; lang: Lang }) {
  const [hasChat, setHasChat] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("entity_features")
        .select("has_chat")
        .eq("entity_uid", entityUid)
        .maybeSingle();
      setHasChat(!!data?.has_chat);
    })();
  }, [entityUid]);

  const toggle = async () => {
    setToggling(true);
    const next = !hasChat;
    await supabase
      .from("entity_features")
      .upsert({ entity_uid: entityUid, has_chat: next }, { onConflict: "entity_uid" });
    setHasChat(next);
    setToggling(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
            {lang === "pt" ? "Chat App Campo" : "App Campo Chat"}
          </span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 uppercase">
            {lang === "pt" ? "premium" : "premium"}
          </span>
        </div>
        {hasChat !== null && (
          <button
            onClick={toggle}
            disabled={toggling}
            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
              hasChat
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100"
            }`}
          >
            {hasChat
              ? (lang === "pt" ? "Ativo — desativar" : "Active — disable")
              : (lang === "pt" ? "Ativar chat premium" : "Enable premium chat")}
          </button>
        )}
      </div>
      {hasChat === null ? (
        <div className="text-[11px] text-neutral-400 italic py-2">
          {lang === "pt" ? "Carregando..." : "Loading..."}
        </div>
      ) : (
        <ChatInbox entityUid={entityUid} lang={lang} premiumEnabled={hasChat} />
      )}
    </div>
  );
}

// ─── Key Persons section ────────────────────────────────────────────────────

function KeyPersonsSection({ entityUid, lang }: { entityUid: string; lang: Lang }) {
  const [rows, setRows] = useState<KeyPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Add-form state
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [decisionMaker, setDecisionMaker] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/key-persons?entity_uid=${entityUid}`);
      const data = await res.json();
      setRows(data.key_persons || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [entityUid]);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/crm/key-persons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_uid: entityUid,
          full_name: name,
          role_title: role || null,
          email: email || null,
          phone: phone || null,
          is_decision_maker: decisionMaker,
        }),
      });
      setName(""); setRole(""); setEmail(""); setPhone(""); setDecisionMaker(false);
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(lang === "pt" ? "Remover contato?" : "Remove contact?")) return;
    await fetch(`/api/crm/key-persons?id=${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div>
      <SectionHeader
        icon={<Users size={13} className="text-purple-600" />}
        title={lang === "pt" ? "Pessoas-chave" : "Key Persons"}
        count={rows.length}
        onAdd={() => setShowForm(!showForm)}
        addLabel={lang === "pt" ? "Adicionar" : "Add"}
      />

      {showForm && (
        <div className="mb-3 p-3 border border-purple-200 rounded-md bg-purple-50/40 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <CrmInput value={name} onChange={setName} placeholder={lang === "pt" ? "Nome completo *" : "Full name *"} />
            <CrmInput value={role} onChange={setRole} placeholder={lang === "pt" ? "Cargo (ex: Diretor Comercial)" : "Role"} />
            <CrmInput value={email} onChange={setEmail} placeholder="email@empresa.com" />
            <CrmInput value={phone} onChange={setPhone} placeholder="(11) 99999-0000" />
          </div>
          <label className="flex items-center gap-2 text-[11px] text-neutral-600">
            <input type="checkbox" checked={decisionMaker} onChange={(e) => setDecisionMaker(e.target.checked)} />
            {lang === "pt" ? "Tomador de decisão" : "Decision maker"}
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-2.5 py-1 text-[11px] text-neutral-500 hover:text-neutral-700">
              {lang === "pt" ? "Cancelar" : "Cancel"}
            </button>
            <button
              onClick={submit}
              disabled={!name.trim() || saving}
              className="flex items-center gap-1 px-3 py-1 rounded text-[11px] font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              {lang === "pt" ? "Salvar" : "Save"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <SectionLoader />
      ) : rows.length === 0 ? (
        <SectionEmpty text={lang === "pt" ? "Nenhum contato cadastrado" : "No contacts yet"} />
      ) : (
        <div className="space-y-1.5">
          {rows.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-2 px-3 py-2 border border-neutral-200 rounded-md bg-white text-[12px]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-neutral-900">{p.full_name}</span>
                  {p.is_decision_maker && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      {lang === "pt" ? "DECISÃO" : "DECISION"}
                    </span>
                  )}
                  {p.is_gatekeeper && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                      {lang === "pt" ? "GATEKEEPER" : "GATEKEEPER"}
                    </span>
                  )}
                </div>
                {p.role_title && <p className="text-[11px] text-neutral-500">{p.role_title}{p.department ? ` · ${p.department}` : ""}</p>}
                {(p.email || p.phone) && (
                  <p className="text-[11px] text-neutral-500 mt-0.5 font-mono">
                    {p.email}{p.email && p.phone ? " · " : ""}{p.phone}
                  </p>
                )}
              </div>
              <button onClick={() => remove(p.id)} className="text-neutral-300 hover:text-red-500 transition-colors shrink-0">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Meetings section ───────────────────────────────────────────────────────

function MeetingsSection({ entityUid, lang }: { entityUid: string; lang: Lang }) {
  const [rows, setRows] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [modalMode, setModalMode] = useState<"closed" | "create" | "edit">("closed");
  const [editing, setEditing] = useState<Meeting | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/meetings?entity_uid=${entityUid}`);
      const data = await res.json();
      setRows(data.meetings || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [entityUid]);

  const remove = async (id: string) => {
    if (!confirm(lang === "pt" ? "Remover reunião?" : "Remove meeting?")) return;
    await fetch(`/api/crm/meetings?id=${id}`, { method: "DELETE" });
    await load();
  };

  const visible = showAll ? rows : rows.slice(0, 5);
  const toRecord = (m: Meeting): MeetingRecord => ({
    id: m.id,
    entity_uid: m.entity_uid || entityUid,
    meeting_date: m.meeting_date,
    meeting_type: m.meeting_type,
    attendees: m.attendees,
    agenda: m.agenda,
    summary: m.summary,
    next_steps: m.next_steps,
    outcome: m.outcome,
    source: m.source,
    confidentiality: m.confidentiality,
    metadata: m.metadata || null,
  });

  return (
    <div>
      <SectionHeader
        icon={<CalendarDays size={13} className="text-purple-600" />}
        title={lang === "pt" ? "Reuniões" : "Meetings"}
        count={rows.length}
        onAdd={() => { setEditing(null); setModalMode("create"); }}
        addLabel={lang === "pt" ? "Registrar" : "Log"}
      />

      {loading ? (
        <SectionLoader />
      ) : rows.length === 0 ? (
        <SectionEmpty text={lang === "pt" ? "Nenhuma reunião registrada" : "No meetings logged"} />
      ) : (
        <div className="space-y-1.5">
          {visible.map((m) => {
            const outcomeInfo = OUTCOME_LABELS[m.outcome] || OUTCOME_LABELS.pending;
            const typeInfo = MEETING_TYPE_LABELS[m.meeting_type] || MEETING_TYPE_LABELS.outro;
            const meta = m.metadata || {};
            const tech = meta.competitor_tech || [];
            const service = meta.service_interest || [];
            return (
              <div key={m.id} className="px-3 py-2 border border-neutral-200 rounded-md bg-white text-[12px]">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-neutral-900">{new Date(m.meeting_date + "T12:00:00").toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 uppercase">
                      {lang === "pt" ? typeInfo.pt : typeInfo.en}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${outcomeInfo.color}`}>
                      {lang === "pt" ? outcomeInfo.pt : outcomeInfo.en}
                    </span>
                    {meta.mood && (
                      <span className="text-[13px]" title={meta.mood}>{MOOD_EMOJI[meta.mood] || ""}</span>
                    )}
                    {m.source === "onenote_import" && (
                      <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded uppercase">
                        OneNote
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => { setEditing(m); setModalMode("edit"); }}
                      className="text-neutral-300 hover:text-neutral-900 transition-colors"
                      title={lang === "pt" ? "Editar" : "Edit"}
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      onClick={() => remove(m.id)}
                      className="text-neutral-300 hover:text-red-500 transition-colors"
                      title={lang === "pt" ? "Remover" : "Remove"}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                {m.agenda && (
                  <p className="text-[11px] font-semibold text-neutral-800 mb-0.5">{m.agenda}</p>
                )}
                {m.summary && <p className="text-[11px] text-neutral-700 leading-relaxed line-clamp-2">{m.summary}</p>}
                {m.next_steps && (
                  <p className="text-[11px] text-neutral-500 mt-1">
                    <span className="font-bold">{lang === "pt" ? "Próximos: " : "Next: "}</span>
                    {m.next_steps}
                  </p>
                )}
                {(tech.length > 0 || service.length > 0) && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {tech.map((t) => (
                      <span key={"t-" + t} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                        {t}
                      </span>
                    ))}
                    {service.map((s) => (
                      <span key={"s-" + s} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {rows.length > 5 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-[10px] font-semibold text-purple-600 hover:text-purple-800 px-3 py-1"
            >
              {showAll
                ? (lang === "pt" ? "Mostrar menos" : "Show less")
                : (lang === "pt" ? `+ ${rows.length - 5} reuniões` : `+ ${rows.length - 5} meetings`)}
            </button>
          )}
        </div>
      )}

      {modalMode !== "closed" && (
        <MeetingFormModal
          lang={lang}
          entityUid={entityUid}
          meeting={editing ? toRecord(editing) : null}
          onClose={() => setModalMode("closed")}
          onSaved={() => { setModalMode("closed"); load(); }}
        />
      )}
    </div>
  );
}

// ─── Leads section ──────────────────────────────────────────────────────────

function LeadsSection({ entityUid, lang }: { entityUid: string; lang: Lang }) {
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [stage, setStage] = useState("new");
  const [serviceInterest, setServiceInterest] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [probability, setProbability] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [owner, setOwner] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/leads?entity_uid=${entityUid}`);
      const data = await res.json();
      setRows(data.leads || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [entityUid]);

  const submit = async () => {
    setSaving(true);
    try {
      await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_uid: entityUid,
          stage,
          service_interest: serviceInterest || null,
          estimated_value_brl: estimatedValue ? Number(estimatedValue.replace(/\./g, "").replace(",", ".")) : null,
          probability_pct: probability ? Number(probability) : null,
          expected_close_date: closeDate || null,
          owner: owner || null,
          notes: notes || null,
        }),
      });
      setStage("new"); setServiceInterest(""); setEstimatedValue(""); setProbability("");
      setCloseDate(""); setOwner(""); setNotes("");
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const updateStage = async (id: string, newStage: string) => {
    await fetch(`/api/crm/leads?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm(lang === "pt" ? "Remover lead?" : "Remove lead?")) return;
    await fetch(`/api/crm/leads?id=${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div>
      <SectionHeader
        icon={<Target size={13} className="text-purple-600" />}
        title={lang === "pt" ? "Pipeline" : "Pipeline"}
        count={rows.length}
        onAdd={() => setShowForm(!showForm)}
        addLabel={lang === "pt" ? "Novo lead" : "New lead"}
      />

      {showForm && (
        <div className="mb-3 p-3 border border-purple-200 rounded-md bg-purple-50/40 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <CrmSelect
              value={stage}
              onChange={setStage}
              options={Object.entries(STAGE_LABELS).map(([k, v]) => ({ value: k, label: lang === "pt" ? v.pt : v.en }))}
            />
            <CrmInput value={estimatedValue} onChange={setEstimatedValue} placeholder={lang === "pt" ? "Valor estimado (R$)" : "Estimated value"} />
            <CrmInput value={probability} onChange={setProbability} placeholder={lang === "pt" ? "Probabilidade %" : "Probability %"} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <CrmInput value={serviceInterest} onChange={setServiceInterest} placeholder={lang === "pt" ? "Serviço de interesse" : "Service interest"} />
            <CrmInput type="date" value={closeDate} onChange={setCloseDate} />
          </div>
          <CrmInput value={owner} onChange={setOwner} placeholder={lang === "pt" ? "Responsável (você)" : "Owner (you)"} />
          <CrmTextarea value={notes} onChange={setNotes} placeholder={lang === "pt" ? "Notas" : "Notes"} rows={2} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-2.5 py-1 text-[11px] text-neutral-500 hover:text-neutral-700">
              {lang === "pt" ? "Cancelar" : "Cancel"}
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1 rounded text-[11px] font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              {lang === "pt" ? "Salvar" : "Save"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <SectionLoader />
      ) : rows.length === 0 ? (
        <SectionEmpty text={lang === "pt" ? "Nenhum lead aberto" : "No open leads"} />
      ) : (
        <div className="space-y-1.5">
          {rows.map((l) => {
            const stageInfo = STAGE_LABELS[l.stage] || STAGE_LABELS.new;
            return (
              <div key={l.id} className="px-3 py-2 border border-neutral-200 rounded-md bg-white text-[12px]">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={l.stage}
                      onChange={(e) => updateStage(l.id, e.target.value)}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border-0 cursor-pointer ${stageInfo.color}`}
                    >
                      {Object.entries(STAGE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{lang === "pt" ? v.pt : v.en}</option>
                      ))}
                    </select>
                    {l.estimated_value_brl != null && (
                      <span className="text-[11px] font-bold text-neutral-700">{fmtBRL(l.estimated_value_brl)}</span>
                    )}
                    {l.probability_pct != null && (
                      <span className="text-[10px] text-neutral-400">{l.probability_pct}%</span>
                    )}
                    {l.expected_close_date && (
                      <span className="text-[10px] text-neutral-400">
                        ⏱ {new Date(l.expected_close_date + "T12:00:00").toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>
                  <button onClick={() => remove(l.id)} className="text-neutral-300 hover:text-red-500 transition-colors shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
                {l.service_interest && <p className="text-[11px] text-neutral-700">{l.service_interest}</p>}
                {l.notes && <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">{l.notes}</p>}
                {l.owner && <p className="text-[10px] text-neutral-400 mt-0.5">@{l.owner}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────────────

function SectionHeader({
  icon, title, count, onAdd, addLabel,
}: {
  icon: React.ReactNode; title: string; count: number; onAdd: () => void; addLabel: string;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider">{title}</span>
        <span className="text-[10px] text-neutral-400">({count})</span>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-bold text-purple-600 border border-purple-200 hover:bg-purple-50 transition-colors"
      >
        <Plus size={10} />
        {addLabel}
      </button>
    </div>
  );
}

function SectionLoader() {
  return (
    <div className="flex items-center gap-2 text-[11px] text-neutral-400 py-2">
      <Loader2 size={12} className="animate-spin" />
      Carregando...
    </div>
  );
}

function SectionEmpty({ text }: { text: string }) {
  return <p className="text-[11px] text-neutral-400 italic py-2">{text}</p>;
}

function CrmInput({
  value, onChange, placeholder, type = "text",
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-2 py-1 text-[11px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-400"
    />
  );
}

function CrmTextarea({
  value, onChange, placeholder, rows = 3,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-2 py-1 text-[11px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-400 leading-relaxed"
    />
  );
}

function CrmSelect({
  value, onChange, options,
}: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1 text-[11px] bg-white border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-400"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
