"use client";

/**
 * EventFormModal — edit any event row in the unified events table.
 *
 * Covers the fields a human operator cares about (name, date range,
 * location — with inline geocode, type, website, hidden flag) plus
 * a "not an agro event" convenience that flips hidden=true with a
 * reason so the row never re-appears in the feed even if the source
 * keeps re-scraping it.
 */

import { useEffect, useState } from "react";
import { Lang } from "@/lib/i18n";
import {
  Loader2, Save, X, AlertTriangle, EyeOff, MapPin, Calendar, Globe, Check,
} from "lucide-react";

export interface EventEditRecord {
  id: string;
  name: string;
  date: string;
  end_date: string | null;
  location: string | null;
  type: string;
  website: string | null;
  description_pt: string | null;
  source_name: string | null;
  latitude: number | null;
  longitude: number | null;
  hidden?: boolean;
  hidden_reason?: string | null;
}

const TYPES = [
  { value: "fair",       pt: "Feira",      en: "Fair" },
  { value: "conference", pt: "Congresso",  en: "Conference" },
  { value: "workshop",   pt: "Workshop",   en: "Workshop" },
  { value: "webinar",    pt: "Webinar",    en: "Webinar" },
  { value: "summit",     pt: "Fórum",      en: "Summit" },
  { value: "other",      pt: "Outro",      en: "Other" },
];

export function EventFormModal({
  lang, event, onClose, onSaved,
}: {
  lang: Lang;
  event: EventEditRecord;
  onClose: () => void;
  onSaved: (ev: EventEditRecord) => void;
}) {
  const [name, setName] = useState(event.name);
  const [date, setDate] = useState(event.date);
  const [endDate, setEndDate] = useState(event.end_date || "");
  const [location, setLocation] = useState(event.location || "");
  const [type, setType] = useState(event.type || "other");
  const [website, setWebsite] = useState(event.website || "");
  const [description, setDescription] = useState(event.description_pt || "");
  const [lat, setLat] = useState<string>(event.latitude != null ? String(event.latitude) : "");
  const [lng, setLng] = useState<string>(event.longitude != null ? String(event.longitude) : "");
  const [hidden, setHidden] = useState(!!event.hidden);
  const [hiddenReason, setHiddenReason] = useState(event.hidden_reason || "");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const flagNotAgro = () => {
    setHidden(true);
    if (!hiddenReason) setHiddenReason(lang === "pt" ? "Não é evento agro" : "Not an agro event");
  };

  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, any> = {
        name: name.trim(),
        date,
        end_date: endDate || null,
        location: location.trim() || null,
        type,
        website: website.trim() || null,
        description_pt: description.trim() || null,
        hidden,
        hidden_reason: hidden ? (hiddenReason.trim() || null) : null,
      };
      // Only send lat/lng if user actually typed them (empty → let backend geocode)
      if (lat.trim()) body.latitude = Number(lat);
      if (lng.trim()) body.longitude = Number(lng);
      // If location changed and no coords supplied, clear stale coords so geocoder runs
      if (location.trim() !== (event.location || "") && !lat.trim() && !lng.trim()) {
        body.latitude = null;
        body.longitude = null;
      }

      const res = await fetch(`/api/events?id=${encodeURIComponent(event.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onSaved(data.event);
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
            <div className="w-8 h-8 rounded-md bg-amber-100 flex items-center justify-center">
              <Calendar size={14} className="text-amber-700" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-neutral-900">
                {lang === "pt" ? "Editar Evento" : "Edit Event"}
              </h3>
              {event.source_name && (
                <p className="text-[11px] text-neutral-500">{lang === "pt" ? "Fonte:" : "Source:"} {event.source_name}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-neutral-100 text-neutral-500">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <Field label={lang === "pt" ? "Nome do evento" : "Event name"}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-[13px] border border-neutral-300 rounded px-3 py-2 focus:outline-none focus:border-amber-400"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label={lang === "pt" ? "Data início" : "Start date"}>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400"
              />
            </Field>
            <Field label={lang === "pt" ? "Data fim" : "End date"}>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400"
              />
            </Field>
            <Field label={lang === "pt" ? "Tipo" : "Type"}>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400"
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{lang === "pt" ? t.pt : t.en}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            label={lang === "pt" ? "Localização (cidade, UF)" : "Location (city, state)"}
            hint={lang === "pt" ? "Ex: Cuiabá, MT — será geocodificada automaticamente" : "e.g. Cuiabá, MT — auto-geocoded"}
          >
            <div className="flex items-center gap-1.5">
              <MapPin size={13} className="text-neutral-400 shrink-0" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400"
                placeholder="Cuiabá, MT"
              />
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={lang === "pt" ? "Latitude (opcional)" : "Latitude (optional)"}>
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full text-[12px] font-mono border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400"
              />
            </Field>
            <Field label={lang === "pt" ? "Longitude (opcional)" : "Longitude (optional)"}>
              <input
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="w-full text-[12px] font-mono border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400"
              />
            </Field>
          </div>

          <Field label={lang === "pt" ? "Site oficial" : "Website"}>
            <div className="flex items-center gap-1.5">
              <Globe size={13} className="text-neutral-400 shrink-0" />
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400"
                placeholder="https://..."
              />
            </div>
          </Field>

          <Field label={lang === "pt" ? "Descrição / contexto" : "Description / context"}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={lang === "pt" ? "Ex: principais participantes, por que é relevante para o agro regional..." : "e.g. main participants, why it's relevant..."}
              className="w-full text-[12px] border border-neutral-300 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400 leading-relaxed"
            />
          </Field>

          {/* Hidden / not-agro block */}
          <div className={`rounded-md border p-3 ${hidden ? "bg-red-50 border-red-300" : "bg-neutral-50 border-neutral-200"}`}>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hidden}
                onChange={(e) => setHidden(e.target.checked)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <p className="text-[12px] font-bold text-neutral-900 flex items-center gap-1.5">
                  <EyeOff size={12} />
                  {lang === "pt" ? "Ocultar do feed" : "Hide from feed"}
                </p>
                <p className="text-[11px] text-neutral-600 mt-0.5">
                  {lang === "pt"
                    ? "Use para eventos que a fonte classificou errado (ex: shows, eventos não-agro). A linha continua no banco para evitar re-importação."
                    : "Use for events the source misclassified (e.g. concerts, non-agro). The row stays in the DB to prevent re-import."}
                </p>
              </div>
            </label>
            {!hidden && (
              <button
                type="button"
                onClick={flagNotAgro}
                className="mt-2 ml-6 text-[10px] font-bold text-red-700 hover:text-red-900 underline"
              >
                {lang === "pt" ? "Marcar como NÃO é evento agro" : "Mark as NOT an agro event"}
              </button>
            )}
            {hidden && (
              <input
                type="text"
                value={hiddenReason}
                onChange={(e) => setHiddenReason(e.target.value)}
                placeholder={lang === "pt" ? "Motivo (opcional)" : "Reason (optional)"}
                className="mt-2 ml-6 w-[calc(100%-1.5rem)] text-[11px] border border-red-200 bg-white rounded px-2 py-1 focus:outline-none focus:border-red-400"
              />
            )}
          </div>

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
            disabled={saving || !name.trim() || !date}
            className="px-4 py-2 bg-amber-600 text-white text-[12px] font-bold rounded hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {lang === "pt" ? "Salvar" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
