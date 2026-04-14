"use client";

/**
 * SimilarTargetsSection — "find me more companies like this one".
 *
 * Mounted inside EntityCrmPanel. Calls /api/crm/similar-targets which
 * scores every entity in v_entity_crm_profile with Jaccard similarity
 * on the competitor_tech + service_interest tag arrays (+ role-overlap
 * boost). Pure algorithm, no LLM.
 *
 * The "same role" toggle restricts matches to entities that share at
 * least one entity_role with the seed — useful when you want to find
 * *other retailers* similar to the current one, not competitors or
 * financial institutions that happen to talk about the same tech.
 */

import { useCallback, useEffect, useState } from "react";
import { Lang } from "@/lib/i18n";
import {
  Users, Loader2, Sparkles, ChevronDown, ChevronUp, ExternalLink, RefreshCw,
} from "lucide-react";

interface SimilarMatch {
  entity_uid: string;
  display_name: string | null;
  legal_name: string | null;
  score: number;
  j_tech: number;
  j_service: number;
  shared_tech: string[];
  shared_service: string[];
  shared_roles: string[];
  roles: string[] | null;
  meeting_count: number;
  last_meeting_date: string | null;
  key_person_count: number;
  lead_stage: string | null;
  lead_service_interest: string | null;
  lead_estimated_value_brl: number | null;
}

interface SeedProfile {
  entity_uid: string;
  display_name: string | null;
  competitor_tech_tags: string[];
  service_interest_tags: string[];
  roles: string[];
  meeting_count: number;
}

export function SimilarTargetsSection({
  entityUid,
  lang,
}: {
  entityUid: string;
  lang: Lang;
}) {
  const [matches, setMatches] = useState<SimilarMatch[]>([]);
  const [seed, setSeed] = useState<SeedProfile | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [sameRole, setSameRole] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setNote(null);
    try {
      const params = new URLSearchParams({
        entity_uid: entityUid,
        limit: "8",
        min_score: "0.10",
      });
      if (sameRole) params.set("same_role", "true");
      const res = await fetch(`/api/crm/similar-targets?${params}`);
      const data = await res.json();
      setMatches(data.matches || []);
      setSeed(data.seed || null);
      if (data.note) setNote(data.note);
    } finally {
      setLoading(false);
    }
  }, [entityUid, sameRole]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-1.5"
      >
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-purple-600" />
          <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
            {lang === "pt" ? "Alvos Similares" : "Similar Targets"}
          </span>
          {matches.length > 0 && (
            <span className="text-[10px] text-neutral-400">({matches.length})</span>
          )}
        </div>
        {open ? <ChevronUp size={12} className="text-neutral-400" /> : <ChevronDown size={12} className="text-neutral-400" />}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {/* Seed + toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-600">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={sameRole}
                onChange={(e) => setSameRole(e.target.checked)}
              />
              {lang === "pt" ? "Mesmo papel (retailer/indústria/...)" : "Same role only"}
            </label>
            <button
              onClick={fetchData}
              className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-800"
            >
              <RefreshCw size={10} />
              {lang === "pt" ? "Recalcular" : "Recompute"}
            </button>
          </div>

          {seed && (seed.competitor_tech_tags.length > 0 || seed.service_interest_tags.length > 0) && (
            <div className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md">
              <p className="text-[10px] uppercase font-bold text-neutral-500 mb-1 tracking-wider">
                {lang === "pt" ? "Perfil de referência" : "Reference profile"}
              </p>
              <div className="flex flex-wrap gap-1">
                {seed.competitor_tech_tags.map((t) => (
                  <span key={"t-" + t} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    {t}
                  </span>
                ))}
                {seed.service_interest_tags.map((s) => (
                  <span key={"s-" + s} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-[11px] text-neutral-400 py-2">
              <Loader2 size={12} className="animate-spin" />
              {lang === "pt" ? "Calculando similaridade..." : "Computing similarity..."}
            </div>
          ) : note ? (
            <p className="text-[11px] text-neutral-500 italic py-2">{note}</p>
          ) : matches.length === 0 ? (
            <p className="text-[11px] text-neutral-400 italic py-2">
              {lang === "pt"
                ? "Nenhuma entidade similar acima do limite mínimo."
                : "No entities above the similarity threshold."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {matches.map((m) => (
                <MatchRow key={m.entity_uid} match={m} lang={lang} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MatchRow({ match, lang }: { match: SimilarMatch; lang: Lang }) {
  const scorePct = Math.round(match.score * 100);
  const scoreColor =
    scorePct >= 60 ? "bg-emerald-100 text-emerald-800" :
    scorePct >= 35 ? "bg-amber-100 text-amber-800" :
    "bg-neutral-100 text-neutral-700";

  return (
    <div className="px-3 py-2 border border-neutral-200 rounded-md bg-white text-[11px]">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${scoreColor}`}>
              {scorePct}% match
            </span>
            <span className="font-bold text-neutral-900 truncate">{match.display_name || match.legal_name || "—"}</span>
            {(match.roles || []).slice(0, 2).map((r) => (
              <span key={r} className="text-[9px] font-semibold px-1 py-0.5 rounded bg-neutral-100 text-neutral-600 uppercase">
                {r.replace(/_/g, " ")}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-neutral-500 text-[10px]">
            {match.meeting_count > 0 && (
              <span>{match.meeting_count} {lang === "pt" ? "reuniões" : "meetings"}</span>
            )}
            {match.key_person_count > 0 && (
              <span>{match.key_person_count} {lang === "pt" ? "contatos" : "contacts"}</span>
            )}
            {match.lead_stage && (
              <span className="text-purple-600 font-semibold uppercase">{match.lead_stage}</span>
            )}
          </div>
        </div>
      </div>
      {(match.shared_tech.length > 0 || match.shared_service.length > 0) && (
        <div className="flex flex-wrap gap-1 mt-1">
          {match.shared_tech.map((t) => (
            <span key={"t-" + t} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
              {t}
            </span>
          ))}
          {match.shared_service.map((s) => (
            <span key={"s-" + s} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
