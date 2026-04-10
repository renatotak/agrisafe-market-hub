"use client";

/**
 * Phase 25 — Source CRUD form modal.
 *
 * Used by DataSources.tsx to create or edit a `data_sources` row.
 * Mirrors the editable fields exposed by /api/data-sources.
 *
 *   <SourceFormModal
 *     mode="add"             // or "edit"
 *     initial={existingRow}  // required when mode="edit"
 *     onSaved={handleSaved}  // called with the new/updated row
 *     onClose={() => ...}
 *     lang={lang}
 *   />
 *
 * The modal does its own POST/PATCH against /api/data-sources. Parent
 * gets the result via onSaved so it can refresh its in-memory list.
 */

import { useState, useEffect } from "react";
import { Lang } from "@/lib/i18n";
import { X, Save, Loader2, AlertCircle } from "lucide-react";

export interface SourceRow {
  id?: string;
  name: string;
  source_org?: string | null;
  category: string;
  data_type?: string | null;
  description?: string | null;
  frequency: string;
  url: string;
  url_secondary?: string | null;
  server?: string | null;
  automated?: boolean;
  notes?: string | null;
  used_in_app?: boolean;
  active?: boolean;
  origin_file?: string | null;
}

interface Props {
  mode: "add" | "edit";
  initial?: SourceRow | null;
  onSaved: (row: SourceRow) => void;
  onClose: () => void;
  lang: Lang;
}

const CATEGORIES = [
  "fiscal", "socioambiental", "financeiro", "agropecuaria", "agronomico",
  "logistica", "geografias", "noticias", "regulacao", "juridico",
  "indicadores", "insumos", "clima", "cadastral", "outros",
];

const FREQUENCIES = [
  "diaria", "semanal", "mensal", "trimestral", "anual", "nao_informado",
];

const T = {
  pt: {
    addTitle: "Adicionar Fonte de Dados",
    editTitle: "Editar Fonte de Dados",
    name: "Nome",
    org: "Organização",
    category: "Categoria",
    dataType: "Tipo de Dados",
    description: "Descrição",
    frequency: "Frequência",
    url: "URL",
    urlSec: "URL Secundária",
    server: "Servidor",
    automated: "Automatizado (scraper rodando)",
    usedInApp: "Em uso pela aplicação",
    notes: "Observações",
    active: "Ativo",
    save: "Salvar",
    saving: "Salvando…",
    cancel: "Cancelar",
    required: "Obrigatório",
    invalidUrl: "URL deve começar com http:// ou https://",
    placeholderName: "ex: BCB SGS — Soja CEPEA",
    placeholderUrl: "https://...",
  },
  en: {
    addTitle: "Add Data Source",
    editTitle: "Edit Data Source",
    name: "Name",
    org: "Organization",
    category: "Category",
    dataType: "Data Type",
    description: "Description",
    frequency: "Frequency",
    url: "URL",
    urlSec: "Secondary URL",
    server: "Server",
    automated: "Automated (scraper running)",
    usedInApp: "Used by the app",
    notes: "Notes",
    active: "Active",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    required: "Required",
    invalidUrl: "URL must start with http:// or https://",
    placeholderName: "e.g.: BCB SGS — Soybean CEPEA",
    placeholderUrl: "https://...",
  },
} as const;

export function SourceFormModal({ mode, initial, onSaved, onClose, lang }: Props) {
  const tr = T[lang];
  const [form, setForm] = useState<SourceRow>(() => ({
    name: initial?.name || "",
    source_org: initial?.source_org || "",
    category: initial?.category || "outros",
    data_type: initial?.data_type || "",
    description: initial?.description || "",
    frequency: initial?.frequency || "nao_informado",
    url: initial?.url || "",
    url_secondary: initial?.url_secondary || "",
    server: initial?.server || "",
    automated: initial?.automated ?? false,
    used_in_app: initial?.used_in_app ?? false,
    notes: initial?.notes || "",
    active: initial?.active ?? true,
  }));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form if initial changes (e.g. opening modal for a different row)
  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name || "",
        source_org: initial.source_org || "",
        category: initial.category || "outros",
        data_type: initial.data_type || "",
        description: initial.description || "",
        frequency: initial.frequency || "nao_informado",
        url: initial.url || "",
        url_secondary: initial.url_secondary || "",
        server: initial.server || "",
        automated: initial.automated ?? false,
        used_in_app: initial.used_in_app ?? false,
        notes: initial.notes || "",
        active: initial.active ?? true,
      });
    }
  }, [initial]);

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim()) return setError(tr.required + ": " + tr.name);
    if (!form.url.trim()) return setError(tr.required + ": " + tr.url);
    if (!/^https?:\/\//i.test(form.url)) return setError(tr.invalidUrl);

    setSaving(true);
    try {
      const isEdit = mode === "edit" && initial?.id;
      const path = isEdit
        ? `/api/data-sources?id=${encodeURIComponent(initial!.id!)}`
        : `/api/data-sources`;
      const res = await fetch(path, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `HTTP ${res.status}`);
        setSaving(false);
        return;
      }
      onSaved(json.source);
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
          <h3 className="text-[15px] font-bold text-neutral-900">
            {mode === "add" ? tr.addTitle : tr.editTitle}
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          {error && (
            <div className="flex items-start gap-2 p-2.5 bg-error-light border border-error/30 rounded text-[12px] text-error-dark">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Name + Organization */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label={tr.name + " *"}>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={tr.placeholderName}
                className={inputCls}
              />
            </Field>
            <Field label={tr.org}>
              <input
                type="text"
                value={form.source_org || ""}
                onChange={(e) => setForm({ ...form, source_org: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          {/* URL */}
          <Field label={tr.url + " *"}>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder={tr.placeholderUrl}
              className={inputCls}
            />
          </Field>

          {/* Secondary URL + Server */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label={tr.urlSec}>
              <input
                type="url"
                value={form.url_secondary || ""}
                onChange={(e) => setForm({ ...form, url_secondary: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={tr.server}>
              <input
                type="text"
                value={form.server || ""}
                onChange={(e) => setForm({ ...form, server: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          {/* Category + Frequency + Data Type */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label={tr.category + " *"}>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={inputCls}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={tr.frequency}>
              <select
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                className={inputCls}
              >
                {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label={tr.dataType}>
              <input
                type="text"
                value={form.data_type || ""}
                onChange={(e) => setForm({ ...form, data_type: e.target.value })}
                placeholder="JSON / CSV / RSS / SHP"
                className={inputCls}
              />
            </Field>
          </div>

          {/* Description */}
          <Field label={tr.description}>
            <textarea
              value={form.description || ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className={inputCls}
            />
          </Field>

          {/* Notes */}
          <Field label={tr.notes}>
            <textarea
              value={form.notes || ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className={inputCls}
            />
          </Field>

          {/* Boolean toggles */}
          <div className="flex flex-wrap gap-4 pt-1">
            <Toggle
              checked={form.automated ?? false}
              onChange={(v) => setForm({ ...form, automated: v })}
              label={tr.automated}
            />
            <Toggle
              checked={form.used_in_app ?? false}
              onChange={(v) => setForm({ ...form, used_in_app: v })}
              label={tr.usedInApp}
            />
            <Toggle
              checked={form.active ?? true}
              onChange={(v) => setForm({ ...form, active: v })}
              label={tr.active}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-200 bg-neutral-50 rounded-b-lg">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-[12px] font-semibold text-neutral-700 hover:bg-neutral-200 rounded-md transition-colors"
          >
            {tr.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold text-white bg-brand-primary hover:bg-brand-dark rounded-md disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? tr.saving : tr.save}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-md text-[12px] text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-brand-primary"
      />
      <span className="text-[12px] text-neutral-700">{label}</span>
    </label>
  );
}
