"use client";

import { useState } from "react";
import { Lang, t } from "@/lib/i18n";
import { MarketPulse } from "@/components/MarketPulse";
import { CampaignCenter } from "@/components/CampaignCenter";
import { ContentEngine } from "@/components/ContentEngine";
import { CompetitorRadar } from "@/components/CompetitorRadar";
import { EventTracker } from "@/components/EventTracker";
import {
  BarChart3,
  Megaphone,
  PenTool,
  Radar,
  Calendar,
  Globe,
  Shield,
  LayoutDashboard,
} from "lucide-react";

type Module = "dashboard" | "market" | "campaigns" | "content" | "competitors" | "events";

export default function Home() {
  const [lang, setLang] = useState<Lang>("pt");
  const [activeModule, setActiveModule] = useState<Module>("dashboard");
  const tr = t(lang);

  const modules = [
    { id: "market" as Module, icon: BarChart3, label: tr.modules.marketPulse, color: "bg-emerald-500" },
    { id: "campaigns" as Module, icon: Megaphone, label: tr.modules.campaigns, color: "bg-blue-500" },
    { id: "content" as Module, icon: PenTool, label: tr.modules.content, color: "bg-purple-500" },
    { id: "competitors" as Module, icon: Radar, label: tr.modules.competitors, color: "bg-orange-500" },
    { id: "events" as Module, icon: Calendar, label: tr.modules.events, color: "bg-rose-500" },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col fixed h-full">
        <div className="p-5 border-b border-slate-700">
          <h1 className="text-lg font-bold text-emerald-400">🌾 {tr.appName}</h1>
          <p className="text-xs text-slate-400 mt-1">{tr.tagline}</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <button
            onClick={() => setActiveModule("dashboard")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              activeModule === "dashboard"
                ? "bg-slate-700 text-white"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <LayoutDashboard size={18} />
            {tr.nav.dashboard}
          </button>

          {modules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => setActiveModule(mod.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                activeModule === mod.id
                  ? "bg-slate-700 text-white"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <mod.icon size={18} />
              {mod.label}
            </button>
          ))}
        </nav>

        {/* Privacy Badge */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-900/30 px-3 py-2 rounded-lg">
            <Shield size={14} />
            {tr.privacy.badge}
          </div>
        </div>

        {/* Language Toggle */}
        <div className="p-4 border-t border-slate-700">
          <button
            onClick={() => setLang(lang === "pt" ? "en" : "pt")}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors"
          >
            <Globe size={16} />
            {lang === "pt" ? "English" : "Português"}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8">
        {activeModule === "dashboard" && (
          <DashboardOverview lang={lang} modules={modules} setActiveModule={setActiveModule} />
        )}
        {activeModule === "market" && <MarketPulse lang={lang} />}
        {activeModule === "campaigns" && <CampaignCenter lang={lang} />}
        {activeModule === "content" && <ContentEngine lang={lang} />}
        {activeModule === "competitors" && <CompetitorRadar lang={lang} />}
        {activeModule === "events" && <EventTracker lang={lang} />}
      </main>
    </div>
  );
}

function DashboardOverview({
  lang,
  modules,
  setActiveModule,
}: {
  lang: Lang;
  modules: { id: string; icon: React.ComponentType<{ size?: number }>; label: string; color: string }[];
  setActiveModule: (m: Module) => void;
}) {
  const tr = t(lang);

  const stats = [
    { label: lang === "pt" ? "Commodities Monitoradas" : "Commodities Tracked", value: "6", color: "text-emerald-600" },
    { label: lang === "pt" ? "Campanhas Ativas" : "Active Campaigns", value: "2", color: "text-blue-600" },
    { label: lang === "pt" ? "Ideias de Conteúdo" : "Content Ideas", value: "6", color: "text-purple-600" },
    { label: lang === "pt" ? "Concorrentes Monitorados" : "Competitors Tracked", value: "5", color: "text-orange-600" },
    { label: lang === "pt" ? "Eventos Próximos" : "Upcoming Events", value: "6", color: "text-rose-600" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">{tr.nav.dashboard}</h2>
        <p className="text-slate-500 mt-1">{tr.tagline}</p>
        <div className="mt-3 inline-flex items-center gap-2 text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-200">
          <Shield size={12} />
          {tr.privacy.notice}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Module Cards */}
      <div className="grid grid-cols-3 gap-6">
        {modules.map((mod) => (
          <button
            key={mod.id}
            onClick={() => setActiveModule(mod.id as Module)}
            className="card-hover bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-left"
          >
            <div className={`w-12 h-12 ${mod.color} rounded-xl flex items-center justify-center mb-4`}>
              <mod.icon size={24} />
            </div>
            <h3 className="font-semibold text-slate-900">{mod.label}</h3>
            <p className="text-sm text-slate-500 mt-1">
              {mod.id === "market" && (lang === "pt" ? "Preços, câmbio e indicadores do agro" : "Prices, exchange rates and agro indicators")}
              {mod.id === "campaigns" && (lang === "pt" ? "Planejamento e acompanhamento" : "Planning and tracking")}
              {mod.id === "content" && (lang === "pt" ? "Ideias, artigos e calendário" : "Ideas, articles and calendar")}
              {mod.id === "competitors" && (lang === "pt" ? "Movimentos do mercado" : "Market movements")}
              {mod.id === "events" && (lang === "pt" ? "Conferências e oportunidades" : "Conferences and opportunities")}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
