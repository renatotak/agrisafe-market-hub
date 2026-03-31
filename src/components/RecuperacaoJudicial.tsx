"use client";

import { useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
  Scale,
  ExternalLink,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Building2,
  MapPin,
} from "lucide-react";
import { ENTITY_TYPES, RJ_STATUS, type RecuperacaoJudicial as RJType } from "@/data/recuperacao";

const PAGE_SIZE = 15;

export function RecuperacaoJudicial({ lang }: { lang: Lang }) {
  const [items, setItems] = useState<RJType[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stats, setStats] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    setPage(0);
  }, [entityTypeFilter, stateFilter, statusFilter]);

  useEffect(() => {
    fetchItems();
  }, [page, entityTypeFilter, stateFilter, statusFilter]);

  const fetchStats = async () => {
    const { data } = await supabase
      .from("recuperacao_judicial")
      .select("status");
    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((item: any) => {
        const s = item.status || "em_andamento";
        counts[s] = (counts[s] || 0) + 1;
      });
      setStats(counts);
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    let query = supabase
      .from("recuperacao_judicial")
      .select("*", { count: "exact" })
      .order("filing_date", { ascending: false, nullsFirst: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (entityTypeFilter) query = query.eq("entity_type", entityTypeFilter);
    if (stateFilter) query = query.eq("state", stateFilter);
    if (statusFilter) query = query.eq("status", statusFilter);

    const { data, count } = await query;
    if (data) setItems(data);
    if (count != null) setTotalCount(count);
    setLoading(false);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const totalCases = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            {lang === "pt" ? "Recuperação Judicial" : "Judicial Recovery"}
          </h2>
          <p className="text-slate-500 mt-1 text-sm md:text-base">
            {lang === "pt"
              ? "Monitoramento de processos no agronegócio"
              : "Monitoring agribusiness judicial recovery cases"}
          </p>
        </div>
        <button
          onClick={() => { setPage(0); fetchItems(); fetchStats(); }}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-rose-600 text-white rounded-xl hover:bg-rose-700 font-medium text-sm transition-all shadow-sm active:scale-95"
        >
          <RefreshCw size={16} />
          {lang === "pt" ? "Atualizar" : "Refresh"}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <div className="bg-white rounded-2xl p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-slate-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase">Total</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{totalCases}</p>
        </div>
        {Object.entries(RJ_STATUS).map(([key, val]) => (
          <div key={key} className="bg-white rounded-2xl p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-100">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${val.color}`}>
              {lang === "pt" ? val.pt : val.en}
            </span>
            <p className="text-2xl font-extrabold text-slate-900 mt-2">{stats[key] || 0}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <select
          value={entityTypeFilter}
          onChange={(e) => setEntityTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs font-medium bg-white border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
        >
          <option value="">{lang === "pt" ? "Todos os Tipos" : "All Types"}</option>
          {Object.entries(ENTITY_TYPES).map(([key, val]) => (
            <option key={key} value={key}>{lang === "pt" ? val.pt : val.en}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs font-medium bg-white border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
        >
          <option value="">{lang === "pt" ? "Todos os Status" : "All Status"}</option>
          {Object.entries(RJ_STATUS).map(([key, val]) => (
            <option key={key} value={key}>{lang === "pt" ? val.pt : val.en}</option>
          ))}
        </select>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs font-medium bg-white border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
        >
          <option value="">{lang === "pt" ? "Todos os Estados" : "All States"}</option>
          {['SP','MT','MS','GO','MG','PR','RS','BA','TO','MA','PA','PI'].map((uf) => (
            <option key={uf} value={uf}>{uf}</option>
          ))}
        </select>
      </div>

      {/* Cases List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-rose-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Scale size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium">
            {lang === "pt" ? "Nenhum caso encontrado" : "No cases found"}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            {lang === "pt"
              ? "Execute o cron de sincronização para coletar dados judiciais"
              : "Run the sync cron to collect judicial data"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const statusInfo = RJ_STATUS[item.status as keyof typeof RJ_STATUS] || RJ_STATUS.em_andamento;
            const entityInfo = ENTITY_TYPES[item.entity_type as keyof typeof ENTITY_TYPES] || ENTITY_TYPES.outros;
            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 p-5 hover:shadow-lg transition-shadow duration-300"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${statusInfo.color}`}>
                      {lang === "pt" ? statusInfo.pt : statusInfo.en}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 flex items-center gap-1">
                      <Building2 size={10} />
                      {lang === "pt" ? entityInfo.pt : entityInfo.en}
                    </span>
                    {item.state && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 flex items-center gap-1">
                        <MapPin size={10} />
                        {item.state}
                      </span>
                    )}
                  </div>
                  {item.filing_date && (
                    <time className="text-xs text-slate-400 font-medium whitespace-nowrap">
                      {new Date(item.filing_date).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                  )}
                </div>

                <h3 className="font-bold text-slate-900 mb-1.5 leading-snug text-sm">
                  {item.entity_name}
                </h3>

                {item.summary && (
                  <p className="text-sm text-slate-500 leading-relaxed line-clamp-2 mb-3">{item.summary}</p>
                )}

                <div className="flex items-center gap-3 text-xs text-slate-400">
                  {item.source_name && <span>{item.source_name}</span>}
                  {item.court && <span>{item.court}</span>}
                  {item.case_number && <span className="font-mono">{item.case_number}</span>}
                  {item.source_url && (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-rose-500 hover:text-rose-700 font-medium ml-auto"
                    >
                      {lang === "pt" ? "Ver fonte" : "View source"}
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 px-1">
          <p className="text-xs text-slate-500">
            {lang === "pt"
              ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} de ${totalCount}`
              : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} of ${totalCount}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-medium text-slate-600">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
