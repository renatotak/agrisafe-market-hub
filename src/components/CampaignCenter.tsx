"use client";

import { useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { Plus, ChevronRight, Loader2, Megaphone } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  description: string;
  status: string;
  channels: string[];
  start_date: string;
  end_date: string;
  pillar: string;
  content_pieces: number;
}

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  planned: "bg-blue-100 text-blue-700",
  active: "bg-emerald-100 text-emerald-700",
  completed: "bg-purple-100 text-purple-700",
};

const channelEmoji: Record<string, string> = {
  linkedin: "💼",
  instagram: "📸",
  blog: "📝",
  email: "📧",
  whatsapp: "💬",
  website: "🌐",
};

export function CampaignCenter({ lang }: { lang: Lang }) {
  const tr = t(lang);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCampaigns() {
      const { data } = await supabase.from("campaigns").select("*").order("start_date");
      if (data) setCampaigns(data);
      setLoading(false);
    }
    fetchCampaigns();
  }, []);

  const statusLabel = (status: string) => {
    const labels: Record<string, Record<string, string>> = {
      draft: { pt: "Rascunho", en: "Draft" },
      planned: { pt: "Planejada", en: "Planned" },
      active: { pt: "Ativa", en: "Active" },
      completed: { pt: "Concluída", en: "Completed" },
    };
    return labels[status]?.[lang] || status;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">{tr.campaigns.title}</h2>
          <p className="text-slate-500 mt-1 text-sm md:text-base">{tr.campaigns.subtitle}</p>
        </div>
        <button className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium text-sm transition-all shadow-sm active:scale-95">
          <Plus size={18} />
          {tr.campaigns.newCampaign}
        </button>
      </div>

      {/* Pipeline Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 mb-8 md:mb-10">
        {(["draft", "planned", "active", "completed"] as const).map((status) => {
          const count = campaigns.filter((c) => c.status === status).length;
          return (
            <div key={status} className="bg-white rounded-2xl p-5 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${statusColors[status]}`}>
                  {statusLabel(status)}
                </span>
                <span className="text-2xl font-extrabold text-slate-900">{count}</span>
              </div>
              <div className="h-2 mt-4 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    status === "draft" ? "bg-slate-400" : status === "planned" ? "bg-blue-500" : status === "active" ? "bg-emerald-500" : "bg-purple-500"
                  }`}
                  style={{ width: `${campaigns.length ? (count / campaigns.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campaign List */}
        <div className="col-span-1 lg:col-span-2 bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 overflow-hidden flex flex-col h-[500px]">
          <div className="px-6 py-5 border-b border-gray-100/80 bg-slate-50/50">
            <h3 className="font-bold text-lg text-slate-900">{lang === "pt" ? "Todas as Campanhas" : "All Campaigns"}</h3>
          </div>
          <div className="divide-y divide-gray-50 flex-1 overflow-y-auto">
            {campaigns.map((campaign) => (
              <button
                key={campaign.id}
                onClick={() => setSelectedCampaign(campaign)}
                className={`w-full px-6 py-5 text-left hover:bg-slate-50/80 transition-all flex items-center justify-between group ${
                  selectedCampaign?.id === campaign.id ? "bg-blue-50/50 border-l-4 border-l-blue-500" : "border-l-4 border-l-transparent"
                }`}
              >
                <div className="flex-1 min-w-0 pr-4">
                  <p className="font-bold text-slate-900 truncate text-base">{campaign.name}</p>
                  <p className="text-sm text-slate-500 mt-1 font-medium">{campaign.pillar}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${statusColors[campaign.status]}`}>
                      {statusLabel(campaign.status)}
                    </span>
                    <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60">
                      {new Date(campaign.start_date).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { month: "short", day: "numeric" })} → {new Date(campaign.end_date).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>
                <ChevronRight size={20} className={`transform transition-transform ${selectedCampaign?.id === campaign.id ? "text-blue-500 translate-x-1" : "text-slate-300 group-hover:text-slate-500"}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Campaign Detail */}
        <div className="col-span-1 bg-white rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-slate-100/60 p-6 lg:p-8 flex flex-col h-[500px] overflow-y-auto">
          {selectedCampaign ? (
            <div>
              <h3 className="font-extrabold text-xl text-slate-900 mb-2">{selectedCampaign.name}</h3>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">{selectedCampaign.description}</p>

              <div className="space-y-5">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{tr.campaigns.status}</p>
                  <span className={`text-sm font-bold px-2.5 py-1 rounded-md ${statusColors[selectedCampaign.status]}`}>
                    {statusLabel(selectedCampaign.status)}
                  </span>
                </div>
                
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{lang === "pt" ? "Pilar Mestre" : "Core Pillar"}</p>
                  <p className="text-base font-bold text-slate-800">{selectedCampaign.pillar}</p>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{lang === "pt" ? "Canais de Destino" : "Target Channels"}</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedCampaign.channels.map((ch) => (
                      <span key={ch} className="text-sm font-medium bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5" title={ch}>
                        <span className="text-lg">{channelEmoji[ch]}</span> {ch.charAt(0).toUpperCase() + ch.slice(1)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{lang === "pt" ? "Peças" : "Assets"}</p>
                    <p className="text-2xl md:text-3xl font-extrabold text-slate-900">{selectedCampaign.content_pieces}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-center text-center">
                    <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{lang === "pt" ? "Período" : "Period"}</p>
                    <p className="text-xs md:text-sm font-bold text-slate-800">
                      {new Date(selectedCampaign.start_date).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { month: "short", day: "numeric" })} <br className="hidden md:block" /> 
                      <span className="text-slate-400 font-normal mx-1">até</span> <br className="hidden md:block" />
                      {new Date(selectedCampaign.end_date).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 py-12">
              <Megaphone size={48} className="text-slate-200 mb-4" />
              <p className="font-medium">{lang === "pt" ? "Selecione uma campanha ao lado" : "Select a campaign from the list"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
