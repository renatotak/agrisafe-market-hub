"use client";

import { useEffect, useState, useMemo } from "react";
import { Lang, t } from "@/lib/i18n";
import { MapPin, ExternalLink, CalendarDays, Loader2, RefreshCw, LayoutList, Calendar, Search, ArrowUpDown, Globe, Monitor } from "lucide-react";

interface AgroEvent {
  id: string;
  nome: string;
  dataInicio: string;
  cidade: string | null;
  estado: string | null;
  imagemUrl: string | null;
  tipo: string;
  formato: string;
  slug: string;
  secao?: string;
}

const typeColors: Record<string, string> = {
  "Feiras Agro": "#E8722A",
  "Congressos": "#1565C0",
  "Encontros": "#5B7A2F",
  "Workshop": "#7B1FA2",
  "Fóruns": "#C62828",
  "Cursos": "#00838F",
  "Semana Acadêmica": "#4527A0",
  "Seminários": "#AD1457",
  "Webinar": "#00695C",
};

function getTypeColor(tipo: string): string {
  return typeColors[tipo] || "#5B7A2F";
}

type ViewMode = "cards" | "list" | "calendar";

export function EventTracker({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [events, setEvents] = useState<AgroEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [view, setView] = useState<ViewMode>("cards");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterUF, setFilterUF] = useState("");
  const [filterCidade, setFilterCidade] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/events-na");
      const json = await res.json();
      if (json.success && json.data?.length > 0) {
        setEvents(json.data);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEvents(); }, []);

  const today = new Date().toISOString().split("T")[0];

  const types = useMemo(() => [...new Set(events.map((e) => e.tipo).filter(Boolean))].sort(), [events]);
  const estados = useMemo(() => [...new Set(events.map((e) => e.estado?.trim()).filter((s): s is string => !!s && s.length === 2))].sort(), [events]);
  const cidades = useMemo(() => {
    const src = filterUF ? events.filter((e) => e.estado?.trim() === filterUF) : events;
    return [...new Set(src.map((e) => e.cidade?.trim()).filter((s): s is string => !!s && s.length > 0))].sort();
  }, [events, filterUF]);

  const hasActiveFilters = !!(filterType || filterUF || filterCidade || filterDateFrom || filterDateTo);

  const clearFilters = () => {
    setFilterType("");
    setFilterUF("");
    setFilterCidade("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setSearchTerm("");
  };

  const filtered = useMemo(() => {
    let list = [...events];
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (e) =>
          e.nome.toLowerCase().includes(q) ||
          e.cidade?.toLowerCase().includes(q) ||
          e.estado?.toLowerCase().includes(q) ||
          e.tipo.toLowerCase().includes(q)
      );
    }
    if (filterType) list = list.filter((e) => e.tipo === filterType);
    if (filterUF) list = list.filter((e) => e.estado?.trim() === filterUF);
    if (filterCidade) list = list.filter((e) => e.cidade?.trim() === filterCidade);
    if (filterDateFrom) list = list.filter((e) => e.dataInicio >= filterDateFrom);
    if (filterDateTo) list = list.filter((e) => e.dataInicio <= filterDateTo);
    if (sortConfig) {
      list.sort((a, b) => {
        const va = (a as any)[sortConfig.key] ?? "";
        const vb = (b as any)[sortConfig.key] ?? "";
        return sortConfig.dir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      });
    }
    return list;
  }, [events, searchTerm, filterType, filterUF, filterCidade, filterDateFrom, filterDateTo, sortConfig]);

  const upcoming = filtered.filter((e) => e.dataInicio >= today);
  const past = filtered.filter((e) => e.dataInicio < today);

  const formatDate = (d: string) => {
    if (!d) return "";
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "short", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-brand-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-neutral-500 mb-4">{lang === "pt" ? "Não foi possível carregar os eventos." : "Could not load events."}</p>
        <button onClick={fetchEvents} className="px-4 py-2 bg-brand-primary text-white rounded-md text-sm font-semibold hover:bg-brand-dark">
          {lang === "pt" ? "Tentar novamente" : "Try again"}
        </button>
      </div>
    );
  }

  // Calendar view helper
  const renderCalendar = () => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(<div key={`e-${i}`} className="h-20 bg-neutral-50 rounded" />);
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayEvents = filtered.filter((e) => e.dataInicio === ds);
      days.push(
        <div key={d} className="min-h-20 bg-white border border-neutral-200 rounded p-1.5 hover:border-brand-primary transition-colors">
          <span className="text-[11px] font-bold text-neutral-400">{d}</span>
          {dayEvents.map((ev) => (
            <a key={ev.id} href={`https://agroagenda.agr.br/event/${ev.slug}`} target="_blank" rel="noopener noreferrer"
              className="block mt-0.5 text-[9px] font-semibold px-1 py-0.5 rounded truncate leading-tight text-white"
              style={{ backgroundColor: getTypeColor(ev.tipo) }}>
              {ev.nome}
            </a>
          ))}
        </div>
      );
    }
    return (
      <div>
        <h3 className="text-lg font-bold text-neutral-800 mb-3 capitalize">
          {now.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { month: "long", year: "numeric" })}
        </h3>
        <div className="grid grid-cols-7 gap-1.5">
          {(lang === "pt" ? ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"] : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]).map((d) => (
            <div key={d} className="text-center text-[10px] font-bold uppercase text-neutral-400 py-1">{d}</div>
          ))}
          {days}
        </div>
      </div>
    );
  };

  const EventCard = ({ ev }: { ev: AgroEvent }) => {
    const isUpcoming = ev.dataInicio >= today;
    return (
      <a
        href={`https://agroagenda.agr.br/event/${ev.slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden hover:border-brand-primary hover:shadow-md transition-all group flex flex-col"
      >
        {ev.imagemUrl && (
          <div className="h-32 bg-neutral-100 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ev.imagemUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
          </div>
        )}
        <div className="p-4 flex-1 flex flex-col">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white" style={{ backgroundColor: getTypeColor(ev.tipo) }}>
              {ev.tipo}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ev.formato === "Online" ? "bg-teal-100 text-teal-700" : "bg-neutral-100 text-neutral-600"}`}>
              {ev.formato === "Online" ? <Monitor size={10} className="inline mr-0.5" /> : <Globe size={10} className="inline mr-0.5" />}
              {ev.formato}
            </span>
            {isUpcoming && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 uppercase">
                {lang === "pt" ? "Próximo" : "Upcoming"}
              </span>
            )}
          </div>
          <h3 className="text-[13px] font-bold text-neutral-900 leading-snug line-clamp-2 group-hover:text-brand-primary transition-colors mb-2">
            {ev.nome}
          </h3>
          <div className="mt-auto space-y-1">
            <p className="text-[12px] text-neutral-500 flex items-center gap-1.5">
              <CalendarDays size={13} className="text-neutral-400 flex-shrink-0" />
              {formatDate(ev.dataInicio)}
            </p>
            {(ev.cidade || ev.estado) && (
              <p className="text-[12px] text-neutral-500 flex items-center gap-1.5">
                <MapPin size={13} className="text-neutral-400 flex-shrink-0" />
                {[ev.cidade, ev.estado].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>
      </a>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-1">{tr.events.title}</h1>
          <p className="text-[14px] text-neutral-500">
            {events.length} {lang === "pt" ? "eventos" : "events"} &middot; {upcoming.length} {lang === "pt" ? "próximos" : "upcoming"}
            <span className="ml-2 text-[11px] text-neutral-400">{lang === "pt" ? "Fonte:" : "Source:"} AgroAgenda</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex items-center bg-white border border-neutral-200 rounded-lg p-0.5">
            {(["cards", "list", "calendar"] as ViewMode[]).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded text-[12px] font-semibold transition-colors flex items-center gap-1.5 ${view === v ? "bg-brand-primary/10 text-brand-primary" : "text-neutral-500 hover:text-neutral-700"}`}>
                {v === "cards" && <LayoutList size={14} />}
                {v === "list" && <ArrowUpDown size={14} />}
                {v === "calendar" && <Calendar size={14} />}
                {v === "cards" ? "Cards" : v === "list" ? "Lista" : (lang === "pt" ? "Calendário" : "Calendar")}
              </button>
            ))}
          </div>
          <button onClick={fetchEvents} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary text-white rounded-lg text-[12px] font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {lang === "pt" ? "Atualizar" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-neutral-200 p-4 space-y-3">
        {/* Row 1: Search + Date range */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
            <input
              type="text"
              placeholder={lang === "pt" ? "Buscar evento, cidade, estado..." : "Search event, city, state..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-neutral-300 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-neutral-500 uppercase flex-shrink-0">{lang === "pt" ? "De" : "From"}</label>
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
              className="px-2.5 py-2 border border-neutral-300 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary" />
            <label className="text-[11px] font-semibold text-neutral-500 uppercase flex-shrink-0">{lang === "pt" ? "Até" : "To"}</label>
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
              className="px-2.5 py-2 border border-neutral-300 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary" />
          </div>
        </div>

        {/* Row 2: UF + Cidade dropdowns */}
        <div className="flex flex-col sm:flex-row gap-3">
          <select value={filterUF} onChange={(e) => { setFilterUF(e.target.value); setFilterCidade(""); }}
            className="px-3 py-2 border border-neutral-300 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary bg-white min-w-[120px]">
            <option value="">{lang === "pt" ? "Todos os estados" : "All states"}</option>
            {estados.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
          <select value={filterCidade} onChange={(e) => setFilterCidade(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-md text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary bg-white min-w-[180px]">
            <option value="">{lang === "pt" ? "Todas as cidades" : "All cities"}</option>
            {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="px-3 py-2 text-[12px] font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors whitespace-nowrap">
              {lang === "pt" ? "Limpar filtros" : "Clear filters"}
            </button>
          )}
          <div className="flex-1" />
          <span className="self-center text-[12px] text-neutral-400">
            {filtered.length} {lang === "pt" ? "resultado(s)" : "result(s)"}
          </span>
        </div>

        {/* Row 3: Type pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <button onClick={() => setFilterType("")}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${!filterType ? "bg-brand-primary text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>
            {lang === "pt" ? "Todos" : "All"}
          </button>
          {types.map((tp) => (
            <button key={tp} onClick={() => setFilterType(tp === filterType ? "" : tp)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap ${filterType === tp ? "text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}
              style={filterType === tp ? { backgroundColor: getTypeColor(tp) } : {}}>
              {tp}
            </button>
          ))}
        </div>
      </div>

      {/* Views */}
      {view === "cards" && (
        <div>
          {upcoming.length > 0 && (
            <>
              <h2 className="text-[14px] font-bold text-neutral-900 mb-3">{lang === "pt" ? "Próximos Eventos" : "Upcoming Events"} ({upcoming.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
                {upcoming.map((ev) => <EventCard key={ev.id} ev={ev} />)}
              </div>
            </>
          )}
          {past.length > 0 && (
            <>
              <h2 className="text-[14px] font-bold text-neutral-500 mb-3">{lang === "pt" ? "Eventos Passados" : "Past Events"} ({past.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-60">
                {past.map((ev) => <EventCard key={ev.id} ev={ev} />)}
              </div>
            </>
          )}
        </div>
      )}

      {view === "list" && (
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 text-left font-semibold uppercase tracking-wider text-[10px]">
                  <th className="px-5 py-3 cursor-pointer hover:bg-neutral-100" onClick={() => setSortConfig({ key: "nome", dir: sortConfig?.key === "nome" && sortConfig.dir === "asc" ? "desc" : "asc" })}>
                    <div className="flex items-center gap-1">{tr.events.event} <ArrowUpDown size={12} /></div>
                  </th>
                  <th className="px-5 py-3 cursor-pointer hover:bg-neutral-100" onClick={() => setSortConfig({ key: "dataInicio", dir: sortConfig?.key === "dataInicio" && sortConfig.dir === "asc" ? "desc" : "asc" })}>
                    <div className="flex items-center gap-1">{tr.events.date} <ArrowUpDown size={12} /></div>
                  </th>
                  <th className="px-5 py-3">{tr.events.location}</th>
                  <th className="px-5 py-3">{tr.events.type}</th>
                  <th className="px-5 py-3 text-right">Formato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filtered.map((ev) => (
                  <tr key={ev.id} className={`hover:bg-neutral-50 transition-colors ${ev.dataInicio < today ? "opacity-50" : ""}`}>
                    <td className="px-5 py-3">
                      <a href={`https://agroagenda.agr.br/event/${ev.slug}`} target="_blank" rel="noopener noreferrer"
                        className="font-medium text-neutral-900 hover:text-brand-primary transition-colors flex items-center gap-1">
                        {ev.nome} <ExternalLink size={11} className="text-neutral-300" />
                      </a>
                    </td>
                    <td className="px-5 py-3 text-neutral-600 whitespace-nowrap">{formatDate(ev.dataInicio)}</td>
                    <td className="px-5 py-3 text-neutral-600">
                      {(ev.cidade || ev.estado) ? [ev.cidade, ev.estado].filter(Boolean).join(", ") : "-"}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white" style={{ backgroundColor: getTypeColor(ev.tipo) }}>
                        {ev.tipo}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-[11px] text-neutral-500">{ev.formato}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "calendar" && (
        <div className="bg-white rounded-lg border border-neutral-200 p-5">
          {renderCalendar()}
        </div>
      )}

      {/* Source attribution */}
      <p className="text-[11px] text-neutral-400 text-center">
        {lang === "pt" ? "Dados fornecidos por" : "Data provided by"}{" "}
        <a href="https://agroagenda.agr.br" target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">
          AgroAgenda
        </a>
      </p>
    </div>
  );
}
