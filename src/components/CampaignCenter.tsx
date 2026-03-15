"use client";

import { useEffect, useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { Plus, ChevronRight, Loader2 } from "lucide-react";

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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{tr.campaigns.title}</h2>
          <p className="text-slate-500 mt-1">{tr.campaigns.subtitle}</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm transition-colors">
          <Plus size={16} />
          {tr.campaigns.newCampaign}
        </button>
      </div>

      {/* Pipeline Overview */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {(["draft", "planned", "active", "completed"] as const).map((status) => {
          const count = campaigns.filter((c) => c.status === status).length;
          return (
            <div key={status} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColors[status]}`}>
                  {statusLabel(status)}
                </span>
                <span className="text-2xl font-bold text-slate-900">{count}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    status === "draft" ? "bg-slate-400" : status === "planned" ? "bg-blue-500" : status === "active" ? "bg-emerald-500" : "bg-purple-500"
                  }`}
                  style={{ width: `${campaigns.length ? (count / campaigns.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Campaign List */}
        <div className="col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-slate-900">{lang === "pt" ? "Todas as Campanhas" : "All Campaigns"}</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {campaigns.map((campaign) => (
              <button
                key={campaign.id}
                onClick={() => setSelectedCampaign(campaign)}
                className={`w-full px-6 py-4 text-left hover:bg-gray-50 transition-colors flex items-center justify-between ${
                  selectedCampaign?.id === campaign.id ? "bg-blue-50" : ""
                }`}
              >
                <div>
                  <p className="font-medium text-slate-900">{campaign.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{campaign.pillar}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${statusColors[campaign.status]}`}>
                      {statusLabel(campaign.status)}
                    </span>
                    <span className="text-xs text-slate-400">
                      {campaign.start_date} → {campaign.end_date}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
            ))}
          </div>
        </div>

        {/* Campaign Detail */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {selectedCampaign ? (
            <div>
              <h3 className="font-semibold text-slate-900 mb-4">{selectedCampaign.name}</h3>
              <p className="text-sm text-slate-600 mb-4">{selectedCampaign.description}</p>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500 uppercase">{tr.campaigns.status}</p>
                  <span className={`text-sm px-2 py-0.5 rounded ${statusColors[selectedCampaign.status]}`}>
                    {statusLabel(selectedCampaign.status)}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">{lang === "pt" ? "Pilar" : "Pillar"}</p>
                  <p className="text-sm font-medium text-slate-900">{selectedCampaign.pillar}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">{lang === "pt" ? "Canais" : "Channels"}</p>
                  <div className="flex gap-1 mt-1">
                    {selectedCampaign.channels.map((ch) => (
                      <span key={ch} className="text-sm bg-gray-100 px-2 py-0.5 rounded" title={ch}>
                        {channelEmoji[ch]} {ch}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">{lang === "pt" ? "Peças de Conteúdo" : "Content Pieces"}</p>
                  <p className="text-2xl font-bold text-slate-900">{selectedCampaign.content_pieces}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">{lang === "pt" ? "Período" : "Period"}</p>
                  <p className="text-sm text-slate-900">{selectedCampaign.start_date} → {selectedCampaign.end_date}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-400 py-12">
              <p>{lang === "pt" ? "Selecione uma campanha" : "Select a campaign"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
