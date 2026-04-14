"use client";

import { useState } from "react";
import {
  FileText, Loader2, Check, AlertTriangle, X, Search,
  ChevronDown, ChevronRight, Upload, Users, Calendar, Target,
} from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import type { ParsedMeeting } from "@/lib/onenote-parser";
import type { CompanyMatch, MatchTier } from "@/lib/onenote-company-matcher";

// ─── Types ────────────────────────────────────────────────────────────

interface ParseResponse {
  stats: {
    totalMeetings: number;
    dateRange: [string, string];
    uniqueCompanies: number;
    uniquePersons: number;
  };
  tierCounts: Record<MatchTier, number>;
  matches: CompanyMatch[];
  meetings: ParsedMeeting[];
}

interface CommitResponse {
  ok: boolean;
  inserted: { meetings: number; key_persons: number; leads: number };
  skipped: number;
  errors: string[];
}

// ─── Component ────────────────────────────────────────────────────────

export function OneNoteImportWizard({ lang }: { lang: Lang }) {
  const tr = t(lang).settings;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseData, setParseData] = useState<ParseResponse | null>(null);
  const [matches, setMatches] = useState<CompanyMatch[]>([]);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);

  // ─── Step 1: Parse ────────────────────────────────────────────────

  const handleParse = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/onenote-import?action=parse", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data: ParseResponse = await res.json();
      setParseData(data);
      setMatches(data.matches);
      setStep(2);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  // ─── Step 3: Commit ───────────────────────────────────────────────

  const handleCommit = async () => {
    if (!parseData) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/onenote-import?action=commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matches, meetings: parseData.meetings }),
      });
      const data: CommitResponse = await res.json();
      setCommitResult(data);
      setStep(3);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  // ─── Match update handler ─────────────────────────────────────────

  const updateMatch = (rawName: string, entityUid: string | null) => {
    setMatches((prev) =>
      prev.map((m) =>
        m.rawName === rawName ? { ...m, selectedEntityUid: entityUid, tier: entityUid ? "likely" : m.tier } : m,
      ),
    );
  };

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-md bg-amber-100 flex items-center justify-center">
          <FileText size={18} className="text-amber-700" />
        </div>
        <div>
          <h3 className="text-[17px] font-bold text-neutral-900">
            {lang === "pt" ? "Importar Notas OneNote (Davi)" : "Import OneNote Notes (Davi)"}
          </h3>
          <p className="text-[12px] text-neutral-500 mt-0.5">
            {lang === "pt"
              ? "439 reuniões comerciais (Mar 2023 – Fev 2026) → CRM"
              : "439 commercial meetings (Mar 2023 – Feb 2026) → CRM"}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold ${
              step >= s ? "bg-brand-primary text-white" : "bg-neutral-200 text-neutral-500"
            }`}>
              {step > s ? <Check size={13} /> : s}
            </div>
            <span className={`text-[12px] font-medium ${step >= s ? "text-neutral-900" : "text-neutral-400"}`}>
              {s === 1 ? (lang === "pt" ? "Analisar" : "Parse") : s === 2 ? (lang === "pt" ? "Confirmar" : "Confirm") : (lang === "pt" ? "Importar" : "Import")}
            </span>
            {s < 3 && <div className="w-8 h-[2px] bg-neutral-200" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-[12px] text-red-700 flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* ─── Step 1: Parse ─────────────────────────────────── */}
      {step === 1 && (
        <div className="text-center py-8">
          <FileText size={48} className="mx-auto text-neutral-300 mb-4" />
          <p className="text-[14px] text-neutral-600 mb-6">
            {lang === "pt"
              ? "Clique para analisar o arquivo de notas do Davi e identificar empresas, contatos e reuniões."
              : "Click to parse Davi's notes file and identify companies, contacts, and meetings."}
          </p>
          <button
            onClick={handleParse}
            disabled={loading}
            className="px-5 py-2.5 bg-brand-primary text-white text-[13px] font-bold rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loading
              ? (lang === "pt" ? "Analisando..." : "Parsing...")
              : (lang === "pt" ? "Analisar Arquivo" : "Parse File")}
          </button>
        </div>
      )}

      {/* ─── Step 2: Review Matches ────────────────────────── */}
      {step === 2 && parseData && (
        <div>
          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard icon={<Calendar size={14} />} label={lang === "pt" ? "Reuniões" : "Meetings"} value={parseData.stats.totalMeetings} />
            <StatCard icon={<Target size={14} />} label={lang === "pt" ? "Empresas" : "Companies"} value={parseData.stats.uniqueCompanies} />
            <StatCard icon={<Users size={14} />} label={lang === "pt" ? "Contatos" : "Contacts"} value={parseData.stats.uniquePersons} />
            <StatCard icon={<Calendar size={14} />} label={lang === "pt" ? "Período" : "Period"} value={`${parseData.stats.dateRange[0].slice(0, 7)} → ${parseData.stats.dateRange[1].slice(0, 7)}`} />
          </div>

          {/* Match groups */}
          <MatchGroup
            lang={lang}
            tier="exact"
            label={lang === "pt" ? "Correspondência automática" : "Auto-matched"}
            color="emerald"
            matches={matches.filter((m) => m.tier === "exact")}
            onUpdate={updateMatch}
            defaultOpen={false}
          />
          <MatchGroup
            lang={lang}
            tier="likely"
            label={lang === "pt" ? "Provável (confirme)" : "Likely (confirm)"}
            color="amber"
            matches={matches.filter((m) => m.tier === "likely")}
            onUpdate={updateMatch}
            defaultOpen={true}
          />
          <MatchGroup
            lang={lang}
            tier="uncertain"
            label={lang === "pt" ? "Incerto (selecione)" : "Uncertain (select)"}
            color="orange"
            matches={matches.filter((m) => m.tier === "uncertain")}
            onUpdate={updateMatch}
            defaultOpen={true}
          />
          <MatchGroup
            lang={lang}
            tier="unmatched"
            label={lang === "pt" ? "Sem correspondência" : "Unmatched"}
            color="red"
            matches={matches.filter((m) => m.tier === "unmatched")}
            onUpdate={updateMatch}
            defaultOpen={true}
          />

          {/* Summary + commit button */}
          <div className="mt-6 pt-4 border-t border-neutral-200 flex items-center justify-between">
            <div className="text-[12px] text-neutral-500">
              {lang === "pt" ? "Empresas vinculadas" : "Linked companies"}:{" "}
              <span className="font-bold text-neutral-900">{matches.filter((m) => m.selectedEntityUid).length}</span>
              {" / "}{matches.length}
              {" · "}
              {lang === "pt" ? "Reuniões a importar" : "Meetings to import"}:{" "}
              <span className="font-bold text-neutral-900">
                {parseData.meetings.filter((m) => matches.some((c) => c.rawName === m.companyName && c.selectedEntityUid)).length}
              </span>
            </div>
            <button
              onClick={handleCommit}
              disabled={loading}
              className="px-5 py-2.5 bg-brand-primary text-white text-[13px] font-bold rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {loading ? (lang === "pt" ? "Importando..." : "Importing...") : (lang === "pt" ? "Importar" : "Import")}
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Results ───────────────────────────────── */}
      {step === 3 && commitResult && (
        <div className="text-center py-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-emerald-600" />
          </div>
          <h4 className="text-[16px] font-bold text-neutral-900 mb-4">
            {lang === "pt" ? "Importação concluída!" : "Import complete!"}
          </h4>
          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-4">
            <ResultCard label={lang === "pt" ? "Reuniões" : "Meetings"} value={commitResult.inserted.meetings} />
            <ResultCard label={lang === "pt" ? "Contatos" : "Contacts"} value={commitResult.inserted.key_persons} />
            <ResultCard label="Leads" value={commitResult.inserted.leads} />
          </div>
          {commitResult.skipped > 0 && (
            <p className="text-[12px] text-neutral-500 mb-2">
              {commitResult.skipped} {lang === "pt" ? "ignorados (sem match ou duplicata)" : "skipped (no match or duplicate)"}
            </p>
          )}
          {commitResult.errors.length > 0 && (
            <div className="mt-3 text-left max-w-lg mx-auto">
              <p className="text-[11px] font-bold text-red-600 mb-1">{commitResult.errors.length} {lang === "pt" ? "erros:" : "errors:"}</p>
              <div className="bg-red-50 border border-red-200 rounded-md p-2 max-h-32 overflow-y-auto">
                {commitResult.errors.map((e, i) => (
                  <p key={i} className="text-[10px] text-red-700 font-mono">{e}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="bg-neutral-50 rounded-lg border border-neutral-200 p-3">
      <div className="flex items-center gap-1.5 text-neutral-500 mb-1">{icon}<span className="text-[10px] font-bold uppercase tracking-wider">{label}</span></div>
      <p className="text-[18px] font-bold text-neutral-900">{value}</p>
    </div>
  );
}

function ResultCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
      <p className="text-[24px] font-bold text-emerald-700">{value}</p>
      <p className="text-[11px] text-emerald-600 font-medium">{label}</p>
    </div>
  );
}

function MatchGroup({
  lang, tier, label, color, matches, onUpdate, defaultOpen,
}: {
  lang: Lang; tier: MatchTier; label: string; color: string;
  matches: CompanyMatch[]; onUpdate: (rawName: string, entityUid: string | null) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (matches.length === 0) return null;

  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    red: "bg-red-50 border-red-200 text-red-700",
  };

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 py-2 text-left"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${colorMap[color]}`}>
          {label}
        </span>
        <span className="text-[12px] text-neutral-500 font-medium">{matches.length} {lang === "pt" ? "empresas" : "companies"}</span>
      </button>
      {open && (
        <div className="ml-5 space-y-1.5 max-h-[400px] overflow-y-auto">
          {matches.map((m) => (
            <MatchRow key={m.rawName} match={m} lang={lang} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchRow({ match, lang, onUpdate }: { match: CompanyMatch; lang: Lang; onUpdate: (rawName: string, entityUid: string | null) => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ entity_uid: string; display_name: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data } = await supabase
        .from("legal_entities")
        .select("entity_uid, display_name")
        .or(`display_name.ilike.%${q}%,legal_name.ilike.%${q}%`)
        .limit(8);
      setSearchResults(data || []);
    } catch { setSearchResults([]); }
    setSearching(false);
  };

  return (
    <div className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-neutral-50 text-[12px]">
      {/* Raw name */}
      <span className="font-medium text-neutral-900 min-w-[160px] truncate" title={match.rawName}>
        {match.rawName}
      </span>

      {/* Meeting count badge */}
      <span className="text-[10px] bg-neutral-100 text-neutral-600 rounded px-1.5 py-0.5 font-mono shrink-0">
        {match.meetingCount}x
      </span>

      {/* Match indicator / selector */}
      <div className="flex-1 min-w-0">
        {match.selectedEntityUid && match.candidates.length > 0 ? (
          <div className="flex items-center gap-2">
            <Check size={12} className="text-emerald-600 shrink-0" />
            <select
              value={match.selectedEntityUid}
              onChange={(e) => onUpdate(match.rawName, e.target.value || null)}
              className="text-[11px] border border-neutral-200 rounded px-2 py-1 bg-white truncate max-w-[250px]"
            >
              {match.candidates.map((c) => (
                <option key={c.entity_uid} value={c.entity_uid}>
                  {c.display_name} ({Math.round(c.score * 100)}%)
                </option>
              ))}
              <option value="">{lang === "pt" ? "— Ignorar —" : "— Skip —"}</option>
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={lang === "pt" ? "Buscar entidade..." : "Search entity..."}
              className="text-[11px] border border-neutral-200 rounded px-2 py-1 w-[200px]"
            />
            {searching && <Loader2 size={10} className="animate-spin text-neutral-400" />}
            {searchResults.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {searchResults.slice(0, 3).map((r) => (
                  <button
                    key={r.entity_uid}
                    onClick={() => { onUpdate(match.rawName, r.entity_uid); setSearchResults([]); setSearchQuery(""); }}
                    className="text-[10px] bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded hover:bg-brand-primary/20 truncate max-w-[150px]"
                  >
                    {r.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unlink button */}
      {match.selectedEntityUid && (
        <button onClick={() => onUpdate(match.rawName, null)} className="text-neutral-400 hover:text-red-500" title="Unlink">
          <X size={12} />
        </button>
      )}
    </div>
  );
}
