"use client";

/**
 * ReclassifyImportsPanel — Phase 6f
 *
 * Settings panel for reclassifying entities imported via OneNote
 * that were auto-assigned role_type='retailer'. Lets the user
 * reassign each entity to a more accurate role.
 */

import { useCallback, useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import {
  Loader2, Check, AlertTriangle, X, RefreshCw, Save, Tags,
} from "lucide-react";

interface EntityRow {
  entity_uid: string;
  name: string;
  tax_id: string | null;
  current_roles: string[];
}

const ROLE_OPTIONS = [
  "retailer",
  "industry",
  "cooperative",
  "trader",
  "financial_institution",
  "other",
] as const;

type RoleType = typeof ROLE_OPTIONS[number];

const ROLE_LABELS: Record<RoleType, { pt: string; en: string }> = {
  retailer:               { pt: "Revenda",               en: "Retailer" },
  industry:               { pt: "Indústria",             en: "Industry" },
  cooperative:            { pt: "Cooperativa",           en: "Cooperative" },
  trader:                 { pt: "Trading",               en: "Trading" },
  financial_institution:  { pt: "Inst. Financeira",      en: "Financial Inst." },
  other:                  { pt: "Outro",                 en: "Other" },
};

export function ReclassifyImportsPanel({ lang }: { lang: Lang }) {
  const tr = t(lang).settings;
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [changes, setChanges] = useState<Map<string, RoleType>>(new Map());
  const [saving, setSaving] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/entities/reclassify");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setEntities(d.entities || []);
      setChanges(new Map());
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRoleChange = (uid: string, role: RoleType) => {
    setChanges((prev) => {
      const next = new Map(prev);
      if (role === "retailer") {
        next.delete(uid); // no change needed
      } else {
        next.set(uid, role);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (changes.size === 0) return;
    setSaving(true);
    setResultMsg(null);
    try {
      const payload = Array.from(changes.entries()).map(([entity_uid, new_role_type]) => ({
        entity_uid,
        new_role_type,
      }));
      const r = await fetch("/api/entities/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: payload }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResultMsg({
        kind: d.errors?.length ? "err" : "ok",
        text: lang === "pt"
          ? `${d.updated} entidades reclassificadas.${d.errors?.length ? ` ${d.errors.length} erro(s).` : ""}`
          : `${d.updated} entities reclassified.${d.errors?.length ? ` ${d.errors.length} error(s).` : ""}`,
      });
      await load();
    } catch (e: any) {
      setResultMsg({ kind: "err", text: e.message });
    }
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-md bg-violet-100 flex items-center justify-center">
            <Tags size={18} className="text-violet-700" />
          </div>
          <div>
            <h3 className="text-[17px] font-bold text-neutral-900">
              {tr.reclassifyTitle}
            </h3>
            <p className="text-[12px] text-neutral-500 mt-0.5">
              {tr.reclassifySubtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {changes.size > 0 && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold text-white bg-brand-primary border border-brand-primary rounded hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {tr.reclassifySave} ({changes.size})
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-neutral-700 bg-white border border-neutral-200 rounded hover:border-neutral-400 disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
        </div>
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

      {loading && entities.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-neutral-400" />
        </div>
      ) : entities.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-neutral-500">
          {tr.reclassifyEmpty}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[11px] font-bold text-neutral-500 uppercase tracking-wider border-b border-neutral-200">
                <th className="py-2 pr-3">{tr.reclassifyColName}</th>
                <th className="py-2 pr-3">{tr.reclassifyColTaxId}</th>
                <th className="py-2 pr-3">{tr.reclassifyColCurrent}</th>
                <th className="py-2 pr-3">{tr.reclassifyColNewRole}</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((e) => {
                const selectedRole = changes.get(e.entity_uid) || "retailer";
                const isChanged = changes.has(e.entity_uid);
                return (
                  <tr
                    key={e.entity_uid}
                    className={`border-b border-neutral-100 ${isChanged ? "bg-amber-50/50" : ""}`}
                  >
                    <td className="py-2 pr-3">
                      <span className="font-semibold text-neutral-900">{e.name}</span>
                      <span className="block text-[10px] font-mono text-neutral-400 mt-0.5">
                        {e.entity_uid.slice(0, 8)}...
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-neutral-600">
                      {e.tax_id || "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {e.current_roles.map((r) => (
                          <span
                            key={r}
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200"
                          >
                            {ROLE_LABELS[r as RoleType]
                              ? (lang === "pt" ? ROLE_LABELS[r as RoleType].pt : ROLE_LABELS[r as RoleType].en)
                              : r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={selectedRole}
                        onChange={(ev) => handleRoleChange(e.entity_uid, ev.target.value as RoleType)}
                        className={`text-[12px] border rounded px-2 py-1.5 ${
                          isChanged
                            ? "border-brand-primary bg-brand-primary/5 text-brand-primary font-bold"
                            : "border-neutral-200 text-neutral-700"
                        }`}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {lang === "pt" ? ROLE_LABELS[r].pt : ROLE_LABELS[r].en}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[11px] text-neutral-400 mt-3">
            {lang === "pt"
              ? `${entities.length} entidades importadas via OneNote com papel 'retailer'.`
              : `${entities.length} entities imported via OneNote with 'retailer' role.`}
          </p>
        </div>
      )}
    </div>
  );
}
