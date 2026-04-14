"use client";

/**
 * Phase 29 — AppCampoPanel.
 *
 * Mounted in Settings. Three tabs:
 *   1. API Playbook — docs, endpoints, auth, code examples
 *   2. API Key Manager — generate, toggle, revoke keys
 *   3. Access Logs — paginated view of api_access_logs
 */

import { useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import {
  Smartphone, Key, BookOpen, BarChart3, Loader2, RefreshCw,
  Plus, Trash2, Copy, Check, AlertTriangle, Shield,
} from "lucide-react";
import { CopyableCode } from "@/components/ui/CopyableCode";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  active: boolean;
  created_at: string;
  last_used_at: string | null;
  access_count: number;
  created_by: string | null;
}

interface AccessLog {
  id: number;
  api_key_id: string | null;
  endpoint: string;
  method: string;
  status_code: number | null;
  ip_address: string | null;
  user_agent: string | null;
  response_time_ms: number | null;
  created_at: string;
  api_keys: { name: string; key_prefix: string } | null;
}

type Tab = "playbook" | "keys" | "logs";

/* ── Helpers ────────────────────────────────────────────────────────────── */

function relativeTime(iso: string, lang: Lang): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
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

function statusColor(code: number | null): string {
  if (!code) return "text-neutral-400";
  if (code < 300) return "text-emerald-600";
  if (code < 400) return "text-amber-600";
  return "text-red-600";
}

/* ── Main Component ─────────────────────────────────────────────────────── */

export function AppCampoPanel({ lang }: { lang: Lang }) {
  const tr = t(lang).settings;
  const [tab, setTab] = useState<Tab>("playbook");

  const TABS: { key: Tab; label: string; icon: typeof BookOpen }[] = [
    { key: "playbook", label: tr.appCampoTabPlaybook, icon: BookOpen },
    { key: "keys", label: tr.appCampoTabKeys, icon: Key },
    { key: "logs", label: tr.appCampoTabLogs, icon: BarChart3 },
  ];

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-md bg-brand-primary/10 flex items-center justify-center">
            <Smartphone size={18} className="text-brand-primary" />
          </div>
          <div>
            <h3 className="text-[17px] font-bold text-neutral-900">{tr.appCampoTitle}</h3>
            <p className="text-[12px] text-neutral-500 mt-0.5">{tr.appCampoSubtitle}</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-5 border-b border-neutral-200">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold border-b-2 transition-colors -mb-px ${
              tab === key
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "playbook" && <PlaybookTab lang={lang} tr={tr} />}
      {tab === "keys" && <KeysTab lang={lang} tr={tr} />}
      {tab === "logs" && <LogsTab lang={lang} tr={tr} />}
    </div>
  );
}

/* ── Tab 1: API Playbook ────────────────────────────────────────────────── */

function PlaybookTab({ lang, tr }: { lang: Lang; tr: any }) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com";

  return (
    <div className="space-y-5">
      {/* Endpoints */}
      <div>
        <h4 className="text-[14px] font-bold text-neutral-900 mb-2">{tr.appCampoEndpointsTitle}</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left border-b border-neutral-200 text-neutral-500">
                <th className="pb-2 pr-4 font-bold">{tr.appCampoLogMethod}</th>
                <th className="pb-2 pr-4 font-bold">{tr.appCampoLogEndpoint}</th>
                <th className="pb-2 font-bold">{lang === "pt" ? "Descrição" : "Description"}</th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              <tr className="border-b border-neutral-100 bg-brand-surface/30">
                <td className="py-2 pr-4"><span className="px-1.5 py-0.5 rounded bg-brand-primary text-white text-[10px] font-bold">GET</span></td>
                <td className="py-2 pr-4 font-mono text-[11px] font-bold">/api/app-campo/events</td>
                <td className="py-2">
                  {lang === "pt"
                    ? "Eventos. Sem state → próximos 30 dias Brasil. Com state=UF → todos futuros no estado."
                    : "Events. No state → next 30 days Brazil. With state=UF → all future in that state."}
                </td>
              </tr>
              <tr className="border-b border-neutral-100 bg-brand-surface/30">
                <td className="py-2 pr-4"><span className="px-1.5 py-0.5 rounded bg-brand-primary text-white text-[10px] font-bold">GET</span></td>
                <td className="py-2 pr-4 font-mono text-[11px] font-bold">/api/app-campo/meetings</td>
                <td className="py-2">
                  {lang === "pt"
                    ? "Reuniões agendadas (público + publicáveis). Filtra por entity_uid, state, janela de datas."
                    : "Scheduled meetings (public + publishable tier). Filter by entity_uid, state, date window."}
                </td>
              </tr>
              <tr className="border-b border-neutral-100 bg-brand-surface/30">
                <td className="py-2 pr-4"><span className="px-1.5 py-0.5 rounded bg-brand-primary text-white text-[10px] font-bold">GET</span></td>
                <td className="py-2 pr-4 font-mono text-[11px] font-bold">/api/app-campo/leads</td>
                <td className="py-2">
                  {lang === "pt"
                    ? "Pipeline de leads do rep (estágio, valor estimado, próximos passos)."
                    : "Rep's lead pipeline (stage, estimated value, next actions)."}
                </td>
              </tr>
              <tr className="border-b border-neutral-100 bg-brand-surface/30">
                <td className="py-2 pr-4"><span className="px-1.5 py-0.5 rounded bg-brand-primary text-white text-[10px] font-bold">GET</span></td>
                <td className="py-2 pr-4 font-mono text-[11px] font-bold">/api/app-campo/digest</td>
                <td className="py-2">
                  {lang === "pt"
                    ? "Briefing diário + contadores (eventos da semana, leads abertos, reuniões 7d)."
                    : "Daily briefing + counters (events this week, open leads, last 7d meetings)."}
                </td>
              </tr>
              <tr className="border-b border-neutral-100 bg-purple-50/40">
                <td className="py-2 pr-4"><span className="px-1.5 py-0.5 rounded bg-purple-600 text-white text-[10px] font-bold">GET</span></td>
                <td className="py-2 pr-4 font-mono text-[11px] font-bold">/api/chat/threads</td>
                <td className="py-2">
                  {lang === "pt"
                    ? "Lista threads de chat. POST cria/upserts thread principal por entidade. Premium gating via entity_features.has_chat."
                    : "List chat threads. POST creates/upserts main thread per entity. Premium gated by entity_features.has_chat."}
                </td>
              </tr>
              <tr className="border-b border-neutral-100 bg-purple-50/40">
                <td className="py-2 pr-4"><span className="px-1.5 py-0.5 rounded bg-purple-600 text-white text-[10px] font-bold">GET / POST</span></td>
                <td className="py-2 pr-4 font-mono text-[11px] font-bold">/api/chat/messages</td>
                <td className="py-2">
                  {lang === "pt"
                    ? "Histórico (GET) + envio (POST). POST ?action=ack body={kind:'delivered'|'read'} marca status. Realtime publica INSERT/UPDATE."
                    : "History (GET) + send (POST). POST ?action=ack body={kind:'delivered'|'read'} flips status. Realtime broadcasts INSERT/UPDATE."}
                </td>
              </tr>
              <tr className="border-b border-neutral-100">
                <td className="py-2 pr-4"><span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold">GET</span></td>
                <td className="py-2 pr-4 font-mono text-[11px]">/api/events-db</td>
                <td className="py-2">{tr.appCampoEndpointEventsDb}</td>
              </tr>
              <tr className="border-b border-neutral-100">
                <td className="py-2 pr-4"><span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold">GET</span></td>
                <td className="py-2 pr-4 font-mono text-[11px]">/api/events-na</td>
                <td className="py-2">{tr.appCampoEndpointEventsNa}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Params — app-campo/events */}
      <div>
        <h4 className="text-[14px] font-bold text-neutral-900 mb-2">
          {lang === "pt" ? "Parâmetros (app-campo/events)" : "Parameters (app-campo/events)"}
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left border-b border-neutral-200 text-neutral-500">
                <th className="pb-2 pr-4 font-bold">Param</th>
                <th className="pb-2 pr-4 font-bold">Default</th>
                <th className="pb-2 font-bold">{lang === "pt" ? "Descrição" : "Description"}</th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              <tr className="border-b border-neutral-100">
                <td className="py-1.5 pr-4 font-mono text-[11px]">state</td>
                <td className="py-1.5 pr-4 text-neutral-400">—</td>
                <td className="py-1.5">
                  {lang === "pt"
                    ? "UF (ex: MT). Se ausente → próximos 30 dias Brasil. Se presente → todos os eventos futuros naquele estado."
                    : "UF (e.g. MT). Absent → next 30 days Brazil-wide. Present → all future events in that state."}
                </td>
              </tr>
              <tr className="border-b border-neutral-100">
                <td className="py-1.5 pr-4 font-mono text-[11px]">days</td>
                <td className="py-1.5 pr-4 text-neutral-400">30</td>
                <td className="py-1.5">{lang === "pt" ? "Janela nacional em dias (max 180, ignorado se state presente)" : "National window in days (max 180, ignored if state is set)"}</td>
              </tr>
              <tr className="border-b border-neutral-100">
                <td className="py-1.5 pr-4 font-mono text-[11px]">limit</td>
                <td className="py-1.5 pr-4 text-neutral-400">100</td>
                <td className="py-1.5">{lang === "pt" ? "Máximo de eventos (max 500)" : "Max events (max 500)"}</td>
              </tr>
              <tr className="border-b border-neutral-100">
                <td className="py-1.5 pr-4 font-mono text-[11px]">include_past</td>
                <td className="py-1.5 pr-4 text-neutral-400">false</td>
                <td className="py-1.5">{lang === "pt" ? "true para incluir eventos passados" : "true to include past events"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Auth */}
      <div>
        <h4 className="text-[14px] font-bold text-neutral-900 mb-2 flex items-center gap-1.5">
          <Shield size={14} />
          {tr.appCampoAuthTitle}
        </h4>
        <p className="text-[12px] text-neutral-600 mb-3">{tr.appCampoAuthDesc}</p>
      </div>

      {/* Code examples */}
      <div>
        <h4 className="text-[14px] font-bold text-neutral-900 mb-2">{tr.appCampoExamplesTitle}</h4>
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
            {lang === "pt" ? "curl — próximos 30 dias (Brasil)" : "curl — next 30 days (Brazil)"}
          </p>
          <CopyableCode text={`curl -H "x-api-key: YOUR_KEY" "${baseUrl}/api/app-campo/events"`} />
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mt-3">
            {lang === "pt" ? "curl — todos eventos futuros em MT" : "curl — all future events in MT"}
          </p>
          <CopyableCode text={`curl -H "x-api-key: YOUR_KEY" "${baseUrl}/api/app-campo/events?state=MT"`} />
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mt-3">JavaScript (fetch)</p>
          <CopyableCode text={`fetch("${baseUrl}/api/app-campo/events?state=MT", { headers: { "x-api-key": "YOUR_KEY" } }).then(r => r.json())`} />
        </div>
        <p className="text-[11px] text-neutral-400 mt-3 flex items-center gap-1">
          <AlertTriangle size={11} />
          {tr.appCampoRateLimit}
        </p>
      </div>
    </div>
  );
}

/* ── Tab 2: API Key Manager ─────────────────────────────────────────────── */

function KeysTab({ lang, tr }: { lang: Lang; tr: any }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/api-keys");
      const json = await res.json();
      setKeys(json.api_keys || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = await res.json();
      if (json.raw_key) {
        setRawKey(json.raw_key);
        setNewName("");
        load();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    await fetch(`/api/api-keys?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    load();
  };

  const handleRevoke = async (id: string) => {
    if (!confirm(tr.appCampoKeyRevokeConfirm)) return;
    await fetch(`/api/api-keys?id=${id}`, { method: "DELETE" });
    load();
  };

  const copyRawKey = async () => {
    if (!rawKey) return;
    try {
      await navigator.clipboard.writeText(rawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div>
      {/* Raw key reveal modal */}
      {rawKey && (
        <div className="mb-4 p-4 rounded-lg border-2 border-amber-300 bg-amber-50">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-amber-600" />
            <span className="text-[12px] font-bold text-amber-800">{tr.appCampoKeyWarningOnce}</span>
          </div>
          <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-md px-3 py-2 font-mono text-[11px] text-neutral-800">
            <code className="flex-1 break-all select-all">{rawKey}</code>
            <button
              onClick={copyRawKey}
              className="flex items-center gap-1 text-[10px] font-bold text-neutral-500 hover:text-brand-primary transition-colors shrink-0"
            >
              {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setRawKey(null)}
            className="mt-2 text-[11px] font-bold text-amber-700 hover:text-amber-900"
          >
            {lang === "pt" ? "Entendi, fechar" : "Got it, close"}
          </button>
        </div>
      )}

      {/* Create form */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder={tr.appCampoKeyName}
          className="flex-1 px-3 py-2 text-[12px] border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-bold bg-brand-primary text-white hover:bg-brand-primary/90 disabled:opacity-40 transition-colors"
        >
          {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {tr.appCampoKeyGenerate}
        </button>
      </div>

      {/* Keys table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-neutral-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : keys.length === 0 ? (
        <div className="py-12 text-center text-[12px] text-neutral-400">{tr.appCampoKeyNone}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left border-b border-neutral-200 text-neutral-500">
                <th className="pb-2 pr-3 font-bold">{tr.appCampoKeyName}</th>
                <th className="pb-2 pr-3 font-bold">{tr.appCampoKeyPrefix}</th>
                <th className="pb-2 pr-3 font-bold">{tr.appCampoKeyCreated}</th>
                <th className="pb-2 pr-3 font-bold">{tr.appCampoKeyLastUsed}</th>
                <th className="pb-2 pr-3 font-bold text-right">{tr.appCampoKeyAccessCount}</th>
                <th className="pb-2 pr-3 font-bold text-center">{tr.appCampoKeyActive}</th>
                <th className="pb-2 font-bold"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                  <td className="py-2 pr-3 font-bold">{k.name}</td>
                  <td className="py-2 pr-3 font-mono text-[11px] text-neutral-500">{k.key_prefix}…</td>
                  <td className="py-2 pr-3 text-neutral-500">{relativeTime(k.created_at, lang)}</td>
                  <td className="py-2 pr-3 text-neutral-500">{k.last_used_at ? relativeTime(k.last_used_at, lang) : "—"}</td>
                  <td className="py-2 pr-3 text-right font-mono">{k.access_count.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-center">
                    <button
                      onClick={() => handleToggle(k.id, k.active)}
                      className={`w-8 h-4 rounded-full relative transition-colors ${k.active ? "bg-emerald-500" : "bg-neutral-300"}`}
                    >
                      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${k.active ? "left-4" : "left-0.5"}`} />
                    </button>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleRevoke(k.id)}
                      className="text-neutral-400 hover:text-red-600 transition-colors"
                      title={tr.appCampoKeyRevoke}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Tab 3: Access Logs ─────────────────────────────────────────────────── */

function LogsTab({ lang, tr }: { lang: Lang; tr: any }) {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filterKeyId, setFilterKeyId] = useState("");
  const [filterEndpoint, setFilterEndpoint] = useState("");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const LIMIT = 50;

  const load = async (newOffset = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(newOffset) });
      if (filterKeyId) params.set("key_id", filterKeyId);
      if (filterEndpoint) params.set("endpoint", filterEndpoint);
      const res = await fetch(`/api/api-access-logs?${params.toString()}`);
      const json = await res.json();
      if (newOffset === 0) {
        setLogs(json.logs || []);
      } else {
        setLogs((prev) => [...prev, ...(json.logs || [])]);
      }
      setTotal(json.total ?? 0);
      setOffset(newOffset);
    } finally {
      setLoading(false);
    }
  };

  const loadKeys = async () => {
    try {
      const res = await fetch("/api/api-keys");
      const json = await res.json();
      setKeys(json.api_keys || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(0); loadKeys(); }, []);
  useEffect(() => { load(0); }, [filterKeyId, filterEndpoint]);

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select
          value={filterKeyId}
          onChange={(e) => setFilterKeyId(e.target.value)}
          className="px-2 py-1.5 text-[11px] border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
        >
          <option value="">{tr.appCampoFilterByKey}</option>
          {keys.map((k) => (
            <option key={k.id} value={k.id}>{k.name} ({k.key_prefix}…)</option>
          ))}
        </select>
        <select
          value={filterEndpoint}
          onChange={(e) => setFilterEndpoint(e.target.value)}
          className="px-2 py-1.5 text-[11px] border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
        >
          <option value="">{tr.appCampoFilterByEndpoint}</option>
          <option value="/api/events-db">/api/events-db</option>
          <option value="/api/events-na">/api/events-na</option>
        </select>
        <button
          onClick={() => load(0)}
          disabled={loading}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-semibold border border-neutral-200 text-neutral-600 hover:border-neutral-300 disabled:opacity-40"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
        </button>
      </div>

      {/* Logs table */}
      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-12 gap-2 text-neutral-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-[12px] text-neutral-400">{tr.appCampoLogNone}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left border-b border-neutral-200 text-neutral-500">
                  <th className="pb-2 pr-3 font-bold">{tr.appCampoLogTimestamp}</th>
                  <th className="pb-2 pr-3 font-bold">{tr.appCampoLogKeyName}</th>
                  <th className="pb-2 pr-3 font-bold">{tr.appCampoLogEndpoint}</th>
                  <th className="pb-2 pr-3 font-bold">{tr.appCampoLogMethod}</th>
                  <th className="pb-2 pr-3 font-bold">{tr.appCampoLogStatus}</th>
                  <th className="pb-2 pr-3 font-bold">{tr.appCampoLogIp}</th>
                  <th className="pb-2 font-bold">ms</th>
                </tr>
              </thead>
              <tbody className="text-neutral-700">
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                    <td className="py-1.5 pr-3 text-neutral-500 font-mono text-[10px]" title={new Date(log.created_at).toLocaleString(lang === "pt" ? "pt-BR" : "en-US")}>
                      {relativeTime(log.created_at, lang)}
                    </td>
                    <td className="py-1.5 pr-3 text-[11px]">
                      {log.api_keys ? (
                        <span className="font-bold">{log.api_keys.name}</span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-[10px]">{log.endpoint}</td>
                    <td className="py-1.5 pr-3">
                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[9px] font-bold">{log.method}</span>
                    </td>
                    <td className={`py-1.5 pr-3 font-mono font-bold ${statusColor(log.status_code)}`}>
                      {log.status_code ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-[10px] text-neutral-400">{log.ip_address || "—"}</td>
                    <td className="py-1.5 font-mono text-[10px] text-neutral-400">{log.response_time_ms ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-400">
            <span>{logs.length} / {total}</span>
            {logs.length < total && (
              <button
                onClick={() => load(offset + LIMIT)}
                disabled={loading}
                className="text-brand-primary hover:underline font-bold disabled:opacity-40"
              >
                {tr.appCampoLogLoadMore}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
