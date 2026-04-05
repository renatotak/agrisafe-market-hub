"use client";

import { useState, useEffect } from "react";
import { Lang } from "@/lib/i18n";
import type { Industry, IndustryProduct } from "@/data/retailers";
import {
  Factory, FlaskConical, Leaf, Map as MapIcon, Users, ExternalLink,
  Loader2, ChevronDown, ChevronUp, ArrowLeft, Globe,
} from "lucide-react";

const TYPE_CONFIG: Record<string, { icon: typeof FlaskConical; color: string; label: string }> = {
  herbicida: { icon: FlaskConical, color: "bg-amber-100 text-amber-800", label: "Herbicidas" },
  inseticida: { icon: FlaskConical, color: "bg-purple-100 text-purple-800", label: "Inseticidas" },
  fungicida: { icon: FlaskConical, color: "bg-blue-100 text-blue-800", label: "Fungicidas" },
  acaricida: { icon: FlaskConical, color: "bg-orange-100 text-orange-800", label: "Acaricidas" },
  biologico: { icon: Leaf, color: "bg-green-100 text-green-800", label: "Biológicos" },
  semente: { icon: Leaf, color: "bg-emerald-100 text-emerald-800", label: "Sementes" },
  fertilizante: { icon: FlaskConical, color: "bg-teal-100 text-teal-800", label: "Fertilizantes" },
};

function classifyProduct(type: string | null): string {
  if (!type) return "outros";
  const lower = type.toLowerCase();
  for (const key of Object.keys(TYPE_CONFIG)) {
    if (lower.includes(key)) return key;
  }
  return "outros";
}

interface IndustryDetail {
  industry: Industry;
  products: IndustryProduct[];
  retailers: any[];
  stats: { product_count: number; retailer_count: number; uf_coverage: string[] };
}

interface Props {
  industryId: string;
  lang: Lang;
  onBack?: () => void;
}

export function IndustryProfile({ industryId, lang, onBack }: Props) {
  const [data, setData] = useState<IndustryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedType, setExpandedType] = useState<string | null>(null);

  useEffect(() => {
    fetchIndustry();
  }, [industryId]);

  const fetchIndustry = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/industries?id=${industryId}`);
      const json = await res.json();
      setData(json);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-neutral-400">
        <Loader2 size={24} className="animate-spin mr-2" />
        {lang === "pt" ? "Carregando perfil da indústria..." : "Loading industry profile..."}
      </div>
    );
  }

  if (!data?.industry) {
    return (
      <div className="text-center py-16 text-neutral-400">
        <Factory size={40} className="mx-auto mb-3 opacity-30" />
        <p>{lang === "pt" ? "Indústria não encontrada" : "Industry not found"}</p>
      </div>
    );
  }

  const { industry, products, retailers, stats } = data;

  // Group products by type
  const grouped = new Map<string, IndustryProduct[]>();
  for (const p of products) {
    const cat = classifyProduct(p.product_type);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(p);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {onBack && (
            <button onClick={onBack} className="mt-1 p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors">
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <h2 className="text-xl font-bold text-neutral-900">{industry.name_display || industry.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              {industry.segment?.map(s => (
                <span key={s} className="text-[10px] font-semibold px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">{s}</span>
              ))}
              {industry.headquarters_country && (
                <span className="text-[11px] text-neutral-500">{industry.headquarters_country}</span>
              )}
            </div>
            {industry.description_pt && (
              <p className="text-[13px] text-neutral-600 mt-2 max-w-2xl">{lang === "pt" ? industry.description_pt : (industry.description_en || industry.description_pt)}</p>
            )}
          </div>
        </div>
        {industry.website && (
          <a href={`https://${industry.website}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-brand-primary hover:underline shrink-0">
            <Globe size={12} /> {industry.website}
          </a>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-neutral-200 p-4 text-center">
          <FlaskConical size={20} className="mx-auto mb-1 text-brand-primary" />
          <p className="text-[24px] font-bold text-neutral-900">{stats.product_count}</p>
          <p className="text-[11px] text-neutral-500">{lang === "pt" ? "Produtos Registrados" : "Registered Products"}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4 text-center">
          <Users size={20} className="mx-auto mb-1 text-brand-primary" />
          <p className="text-[24px] font-bold text-neutral-900">{stats.retailer_count}</p>
          <p className="text-[11px] text-neutral-500">{lang === "pt" ? "Revendas Vinculadas" : "Linked Retailers"}</p>
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4 text-center">
          <MapIcon size={20} className="mx-auto mb-1 text-brand-primary" />
          <p className="text-[24px] font-bold text-neutral-900">{stats.uf_coverage?.length || 0}</p>
          <p className="text-[11px] text-neutral-500">{lang === "pt" ? "Estados Cobertos" : "States Covered"}</p>
        </div>
      </div>

      {/* Product Catalog */}
      {products.length > 0 && (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm">
          <div className="px-5 py-3 border-b border-neutral-200">
            <h3 className="text-[14px] font-semibold text-neutral-900">
              {lang === "pt" ? "Catálogo de Produtos" : "Product Catalog"}
            </h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {lang === "pt" ? "Dados do AGROFIT (MAPA/Embrapa)" : "Data from AGROFIT (MAPA/Embrapa)"}
            </p>
          </div>

          <div className="divide-y divide-neutral-100">
            {[...grouped.entries()].sort((a, b) => b[1].length - a[1].length).map(([type, prods]) => {
              const config = TYPE_CONFIG[type] || { icon: FlaskConical, color: "bg-neutral-100 text-neutral-600", label: type };
              const isExpanded = expandedType === type;
              const Icon = config.icon;

              return (
                <div key={type}>
                  <button
                    onClick={() => setExpandedType(isExpanded ? null : type)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-neutral-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${config.color}`}>
                        <Icon size={10} />
                        {config.label}
                      </span>
                      <span className="text-[12px] text-neutral-600">({prods.length} {lang === "pt" ? "produtos" : "products"})</span>
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="text-left text-[10px] text-neutral-500 uppercase tracking-wider border-b border-neutral-200">
                              <th className="px-2 py-2">{lang === "pt" ? "Produto" : "Product"}</th>
                              <th className="px-2 py-2">{lang === "pt" ? "Ingredientes Ativos" : "Active Ingredients"}</th>
                              <th className="px-2 py-2">{lang === "pt" ? "Culturas" : "Crops"}</th>
                              <th className="px-2 py-2 text-right">{lang === "pt" ? "Toxicidade" : "Toxicity"}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100">
                            {prods.slice(0, 50).map((p) => (
                              <tr key={p.id} className="hover:bg-neutral-50">
                                <td className="px-2 py-2 font-medium text-neutral-900">
                                  {p.product_name}
                                  {p.agrofit_registro && (
                                    <span className="text-[9px] text-neutral-400 ml-1">#{p.agrofit_registro}</span>
                                  )}
                                </td>
                                <td className="px-2 py-2 text-neutral-600 max-w-[200px] truncate">
                                  {p.active_ingredients?.join(", ") || "—"}
                                </td>
                                <td className="px-2 py-2 text-neutral-600 max-w-[180px] truncate">
                                  {p.target_cultures?.slice(0, 5).join(", ") || "—"}
                                  {(p.target_cultures?.length || 0) > 5 && "..."}
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <span className={`text-[10px] font-semibold ${
                                    p.toxicity_class?.includes("IV") || p.toxicity_class?.includes("4") ? "text-green-600" :
                                    p.toxicity_class?.includes("III") || p.toxicity_class?.includes("3") ? "text-amber-600" :
                                    p.toxicity_class?.includes("II") || p.toxicity_class?.includes("2") ? "text-orange-600" :
                                    p.toxicity_class?.includes("I") || p.toxicity_class?.includes("1") ? "text-red-600" :
                                    "text-neutral-500"
                                  }`}>
                                    {p.toxicity_class || "—"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {prods.length > 50 && (
                        <p className="text-[10px] text-neutral-400 mt-2 text-center">
                          {lang === "pt" ? `Mostrando 50 de ${prods.length}` : `Showing 50 of ${prods.length}`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Retailers */}
      {retailers.length > 0 && (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm">
          <div className="px-5 py-3 border-b border-neutral-200">
            <h3 className="text-[14px] font-semibold text-neutral-900">
              {lang === "pt" ? "Principais Revendas" : "Top Retailers"} ({retailers.length})
            </h3>
          </div>
          <div className="divide-y divide-neutral-100 max-h-80 overflow-y-auto">
            {retailers.map((r: any) => (
              <div key={r.cnpj_raiz} className="flex items-center justify-between px-5 py-2.5 hover:bg-neutral-50">
                <div>
                  <p className="text-[12px] font-semibold text-neutral-900">{r.nome_fantasia || r.consolidacao || r.razao_social}</p>
                  <p className="text-[10px] text-neutral-400">{r.grupo_acesso} — {r.relationship_type}</p>
                </div>
                {r.classificacao && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    r.classificacao === "A" ? "bg-green-100 text-green-800" :
                    r.classificacao === "B" ? "bg-blue-100 text-blue-800" :
                    r.classificacao === "C" ? "bg-amber-100 text-amber-800" :
                    "bg-neutral-100 text-neutral-600"
                  }`}>{r.classificacao}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* UF Coverage */}
      {stats.uf_coverage?.length > 0 && (
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-5">
          <h3 className="text-[14px] font-semibold text-neutral-900 mb-3">
            {lang === "pt" ? "Cobertura Geográfica" : "Geographic Coverage"}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {stats.uf_coverage.sort().map(uf => (
              <span key={uf} className="px-2 py-1 bg-brand-surface text-brand-primary text-[11px] font-bold rounded border border-brand-primary/10">
                {uf}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
